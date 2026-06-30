import moment from 'moment'
import {catchError, concat, EMPTY, filter, forkJoin, map, of, switchMap, throwError} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {swallow} from '#sepal/rxjs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {addReproductionMetadata, addSampleProperties, EXPORT_PROPERTY_NAMES} from './sampleProperties.js'
import {stratificationImage$} from './stratificationImage.js'
import {filterSamples, stratifiedSystematicSample} from './systematicSampling.js'
import {findShortfalls, getSampleCounts$, validateSampleCounts$} from './validateSampleCounts.js'

const SQRT3 = Math.sqrt(3)
const MAX_DENSITY_OFFSETS = 24

// Complete, bounded sequence of density offsets [0..maxOffset] applied to the area-based base grid
// (each step halves the cell diameter), with no skipped intermediate power-of-two densities. maxOffset
// is the number of steps from the area-based exponent down to the minimum-distance clamp - computed here
// mirroring the server-side exponent math in stratifiedSystematicSample, so densifying past it is a
// no-op. Offsets >= 1 are denser than the first guess; the last reaches the densest legal grid.
const systematicDensityOffsets = (allocation, sampleArrangement) => {
    const scale = Number(sampleArrangement.scale)
    const minDistance = Math.max(Number(sampleArrangement.minDistance) || scale * 2, scale * 2)
    // minDistance is center-to-center; the internal diameter floor is minDistance / sqrt(3).
    const minExponent = Math.ceil(Math.log2(minDistance / SQRT3))
    const offsets = allocation
        .map(stratum => {
            const targetDiameter = 0.5 * Math.sqrt(8 * Number(stratum.area) / (3 * SQRT3 * Number(stratum.sampleSize)))
            return Math.floor(Math.log2(targetDiameter)) - minExponent
        })
        .filter(Number.isFinite)
    const maxOffset = Math.min(MAX_DENSITY_OFFSETS, Math.max(0, ...(offsets.length ? offsets : [0])))
    return Array.from({length: maxOffset + 1}, (_value, index) => index)
}

// Systematic sampling materializes the unfiltered samples to a temporary EE table asset, then reads it
// back to filter. GEE asset export derives the temp id from the target assetId; SEPAL export has no
// assetId, so create a temp id under the user's first EE asset root (same discovery as toAsset.js) with
// a safe generated name - never the user-facing description.
const tempTableAssetId$ = (taskId, assetId) => {
    const timestamp = moment().format('YYYYMMDDHHmmssSSS')
    if (assetId) {
        return of(`${assetId}_${timestamp}`)
    }
    return ee.listBuckets$('projects/earthengine-legacy').pipe(
        map(({assets}) => {
            if (!assets?.length) {
                throw new Error('EE account has no asset roots')
            }
            return `${assets[0].id}/sampling_design_tmp_${taskId}_${timestamp}`
        })
    )
}

export const exportSystematicToAssets$ = ({taskId, description, recipe, assetId, strategy, properties, destination, workspacePath, filenamePrefix, fileFormat}) => {
    const {model: {
        aoi,
        stratification,
        sampleAllocation: {allocation},
        sampleArrangement
    }} = recipe
    const eeStratification$ = stratificationImage$(stratification)
    const eeGeometry$ = toGeometry$(aoi)

    // CLOSEST may intentionally land below the target; OVER/EXACT must reach the requested count (this
    // also catches the OVER-collapses-to-empty case).
    const requireFull = sampleArrangement.sampleSizeStrategy !== 'CLOSEST'
    const densityOffsets = systematicDensityOffsets(allocation, sampleArrangement)
    const gridCrs = sampleArrangement.crs || 'EPSG:3410'
    const gridCrsTransform = sampleArrangement.crsTransform || ''

    return tempTableAssetId$(taskId, assetId).pipe(
        switchMap(tempAssetId =>
            forkJoin({
                eeStratification: eeStratification$,
                eeGeometry: eeGeometry$
            }).pipe(
                switchMap(({eeStratification, eeGeometry}) =>
                    chooseUnfilteredSamples$(eeStratification, eeGeometry).pipe(
                        switchMap(({unfilteredSamples, densityOffset}) => concat(
                            exportUnfilteredSamples$({unfilteredSamples, tempAssetId}),
                            exportFilteredSamples$({eeGeometry, tempAssetId, densityOffset}),
                            deleteUnfilteredSamples$(tempAssetId)
                        ))
                    )
                ),
                catchError(error => concat(
                    deleteUnfilteredSamples$(tempAssetId),
                    throwError(() => error)
                ))
            )
        )
    )

    // Pick the base-grid density, then materialize the chosen unfiltered collection once. All counting is
    // done in-memory (no per-attempt batch export / temp asset).
    function chooseUnfilteredSamples$(eeStratification, eeGeometry) {
        switch (sampleArrangement.sampleSizeStrategy) {
            case 'CLOSEST': return chooseClosest$(eeStratification, eeGeometry)
            case 'OVER': return chooseSmallestOversample$(eeStratification, eeGeometry)
            default: return chooseByCandidateCount$(eeStratification, eeGeometry) // EXACT
        }
    }

    // EXACT: thins to exactly the requested count, so the coarsest grid with enough raw candidates is
    // correct. Step through the complete offset range from coarsest (0) to densest and stop at the FIRST
    // density where every stratum has at least the requested raw candidates (level-0 cumulative). If none
    // suffices, fall through to the densest grid and let the final guard fail.
    function chooseByCandidateCount$(eeStratification, eeGeometry) {
        const attempt$ = index => {
            const densityOffset = densityOffsets[index]
            const unfilteredSamples = sampleAt(eeStratification, eeGeometry, densityOffset)
            const lastAttempt = index === densityOffsets.length - 1
            return getSampleCounts$(unfilteredSamples).pipe(
                switchMap(counts =>
                    !lastAttempt && findShortfalls(counts, allocation).length
                        ? attempt$(index + 1)
                        : of({unfilteredSamples, densityOffset})
                )
            )
        }
        return attempt$(0)
    }

    // OVER: evaluate the FILTERED result at every density, keep only attempts where every stratum is at
    // least requested, and choose the smallest total surplus Sum(actual - requested). Iterating coarsest
    // to densest with a strict improvement test breaks ties toward the coarser grid. If no attempt
    // satisfies all strata, fall back to the densest grid so the final guard fails with the clear
    // shortfall message. Filtering is evaluated in-memory; only the chosen collection is materialized.
    function chooseSmallestOversample$(eeStratification, eeGeometry) {
        const evaluate$ = (index, best, densest) => {
            if (index >= densityOffsets.length) {
                return of(best || densest)
            }
            const densityOffset = densityOffsets[index]
            const unfilteredSamples = sampleAt(eeStratification, eeGeometry, densityOffset)
            const filtered = filterSamples({
                region: eeGeometry,
                samples: unfilteredSamples,
                allocation,
                strategy: sampleArrangement.sampleSizeStrategy,
                seed: sampleArrangement.seed
            })
            return getSampleCounts$(filtered).pipe(
                switchMap(counts => {
                    const allMet = allocation.every(stratum => (counts[String(stratum.stratum)] || 0) >= Number(stratum.sampleSize))
                    const surplus = allocation.reduce(
                        (sum, stratum) => sum + ((counts[String(stratum.stratum)] || 0) - Number(stratum.sampleSize)),
                        0
                    )
                    const nextBest = allMet && (!best || surplus < best.surplus)
                        ? {unfilteredSamples, densityOffset, surplus}
                        : best
                    return evaluate$(index + 1, nextBest, {unfilteredSamples, densityOffset})
                })
            )
        }
        return evaluate$(0, null, null)
    }

    // CLOSEST: evaluate the FILTERED result at every density and keep the attempt whose per-stratum counts
    // are collectively closest to requested (smallest total absolute difference), requiring every stratum
    // to be non-empty. Filtering is evaluated in-memory; only the chosen unfiltered collection is
    // materialized afterwards. If no attempt keeps all strata non-empty, fall back to the densest grid so
    // the final guard fails with the clear shortfall message.
    function chooseClosest$(eeStratification, eeGeometry) {
        const evaluate$ = (index, best, densest) => {
            if (index >= densityOffsets.length) {
                return of(best || densest)
            }
            const densityOffset = densityOffsets[index]
            const unfilteredSamples = sampleAt(eeStratification, eeGeometry, densityOffset)
            const filtered = filterSamples({
                region: eeGeometry,
                samples: unfilteredSamples,
                allocation,
                strategy: sampleArrangement.sampleSizeStrategy,
                seed: sampleArrangement.seed
            })
            return getSampleCounts$(filtered).pipe(
                switchMap(counts => {
                    const allNonEmpty = allocation.every(stratum => (counts[String(stratum.stratum)] || 0) > 0)
                    const totalDiff = allocation.reduce(
                        (sum, stratum) => sum + Math.abs((counts[String(stratum.stratum)] || 0) - Number(stratum.sampleSize)),
                        0
                    )
                    const nextBest = allNonEmpty && (!best || totalDiff < best.totalDiff)
                        ? {unfilteredSamples, densityOffset, totalDiff}
                        : best
                    return evaluate$(index + 1, nextBest, {unfilteredSamples, densityOffset})
                })
            )
        }
        return evaluate$(0, null, null)
    }

    function sampleAt(eeStratification, eeGeometry, densityOffset) {
        return stratifiedSystematicSample({
            allocation: allocation,
            stratification: eeStratification,
            region: eeGeometry,
            minDistance: sampleArrangement.minDistance,
            scale: sampleArrangement.scale,
            crs: gridCrs,
            crsTransform: gridCrsTransform,
            gridOrigin: sampleArrangement.gridOrigin,
            seed: sampleArrangement.seed,
            densityOffset
        })
    }

    function exportUnfilteredSamples$({unfilteredSamples, tempAssetId}) {
        return tableToAsset$({
            taskId,
            collection: unfilteredSamples,
            description: `${description}_unfiltered`,
            assetId: tempAssetId
        }).pipe(
            filter(({state}) => state !== 'COMPLETED')
        )
    }

    function exportFilteredSamples$({eeGeometry, tempAssetId, densityOffset}) {
        const metadata = {
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: sampleArrangement.sampleSizeStrategy,
            gridOrigin: sampleArrangement.gridOrigin || 'FIXED',
            seed: sampleArrangement.seed,
            minDistance: sampleArrangement.minDistance,
            scale: sampleArrangement.scale,
            crs: gridCrs,
            crsTransform: gridCrsTransform,
            gridCrs,
            gridCrsTransform,
            selectedDensityFactor: null,
            selectedDensityOffset: densityOffset
        }
        const filteredSamples = addReproductionMetadata(
            addSampleProperties(
                filterSamples({
                    region: eeGeometry,
                    samples: ee.FeatureCollection(tempAssetId),
                    allocation,
                    strategy: sampleArrangement.sampleSizeStrategy,
                    seed: sampleArrangement.seed
                }),
                allocation
            ),
            metadata
        ).set(formatProperties(properties))
        const export$ = destination === 'SEPAL'
            ? tableToSepal$(taskId, {
                collection: filteredSamples,
                description,
                workspacePath,
                filenamePrefix,
                fileFormat,
                selectors: EXPORT_PROPERTY_NAMES
            })
            : tableToAsset$({
                taskId,
                collection: filteredSamples,
                description,
                assetId,
                strategy
            })
        // Final guard after adaptive densification: OVER/EXACT must reach the requested count; CLOSEST
        // may undershoot but must not be empty.
        return concat(
            validateSampleCounts$(filteredSamples, allocation, {requireFull}).pipe(swallow()),
            export$
        )
    }

    function deleteUnfilteredSamples$(tempAssetId) {
        return ee.deleteAsset$(tempAssetId).pipe(
            catchError(() => EMPTY),
            swallow()
        )
    }
}
