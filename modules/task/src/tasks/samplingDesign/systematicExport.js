import moment from 'moment'
import {catchError, concat, defer, EMPTY, filter, forkJoin, map, of, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {toId} from '#sepal/ee/samplingDesign/featureProperties'
import {SYSTEMATIC_EXPORT_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {finalizeSystematicSamples, mergeRepairedCandidates, systematicStratumMaxOffset, systematicUnfilteredSamples, toDensitySummary} from '#sepal/ee/samplingDesign/samples'
import {stratificationImage$} from '#sepal/ee/samplingDesign/stratificationImage'
import {isStratificationSkipped} from '#sepal/ee/samplingDesign/stratificationSkip'
import {unstratifiedMaxDensityOffset} from '#sepal/ee/samplingDesign/systematicLatticeMath'
import {filterToExactStratificationMembership, materializeStratifiedExactGeometry, selectSystematicLevels, systematicSelectionSummary} from '#sepal/ee/samplingDesign/systematicSampling'
import {unstratifiedAllocation$} from '#sepal/ee/samplingDesign/unstratifiedArea'
import {materializeSystematicIndexGeometry, unstratifiedSystematicIndexCandidates} from '#sepal/ee/samplingDesign/unstratifiedSystematicSampling'
import {finalizeObservable, swallow} from '#sepal/rxjs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {candidateAssetId, candidateDescription} from './systematicExportNames.js'
import {systematicExportPlan$} from './systematicExportPlan.js'

// Systematic export materializes unfiltered candidate samples to temporary EE table assets, then reads them
// back to filter. GEE asset export derives the temp prefix from the target assetId; SEPAL export has no
// assetId, so create a temp prefix under the user's first EE asset root. The prefix is clearly temporary and
// unique (timestamp / task id); candidateAssetId adds a plain per-kind suffix.
const tempTableAssetId$ = (taskId, assetId) => {
    const timestamp = moment().format('YYYYMMDDHHmmssSSS')
    if (assetId) {
        return of(`${assetId}_tmp_${timestamp}`)
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

// Stratified exact candidates: replace the raster-snapped centroids of these candidates with the exact
// analytical lattice point (per-stratum layout for `densityOffset`), drop any that leave the AOI, then keep
// only those whose EXACT-point stratification class matches their stratum (pre-count membership). Shared by
// the count and final stages so the two never diverge. `scale` is the class-read scale (sampleArrangement.scale).
const stratifiedExactMembers = ({candidates, allocation, region, eeStratification, sampleArrangement, densityOffset}) =>
    filterToExactStratificationMembership({
        samples: materializeStratifiedExactGeometry({candidates, allocation, sampleArrangement, densityOffset}).filterBounds(region),
        stratification: eeStratification,
        scale: sampleArrangement.scale
    })

// Final filter for the stratified exact path. Uses the membership-aware `levelsByStratum` from the count stage
// (never recomputed here), filters candidates to those levels, materializes exact geometry per-stratum at the
// offset each stratum was generated at (repaired strata at the repair offset, the rest at the base offset -
// the merged base+repair asset carries both densities), keeps AOI + exact-membership matches, then for EXACT
// thins AFTER membership keyed by the final exact geometry-derived id (stratified candidates have no idkey).
// Sets the exported id from the exact geometry and strips helper fields so they never reach row-metadata
// (SEPAL/CSV) exports.
const filterStratifiedExactSamples = ({region, candidates, allocation, strategy, seed, baseOffset, repairOffset, repairedStrata, levelsByStratum, eeStratification, sampleArrangement}) => {
    const repaired = new Set((repairedStrata || []).map(({stratum}) => stratum))
    const filteredByLevel = ee.FeatureCollection(allocation
        .map(stratum => {
            const level = ee.Number(levelsByStratum?.[String(stratum.stratum)])
            return candidates
                .filter(ee.Filter.eq('stratum', stratum.stratum))
                .filter(ee.Filter.gte('level', level))
                .map(sample => sample.set('selectedLevel', level))
        })
    ).flatten()
    // Materialize each density group with its own offset, then merge (only non-empty groups, so an
    // empty base or repair subset never forces a schemaless empty-collection merge).
    const members = [
        [allocation.filter(({stratum}) => !repaired.has(stratum)), baseOffset],
        [allocation.filter(({stratum}) => repaired.has(stratum)), repairOffset]
    ]
        .filter(([strata]) => strata.length)
        .map(([strata, densityOffset]) => stratifiedExactMembers({candidates: filteredByLevel, allocation: strata, region, eeStratification, sampleArrangement, densityOffset}))
        .reduce((merged, group) => merged ? merged.merge(group) : group)
    const selected = strategy === 'EXACT'
        ? ee.FeatureCollection(allocation
            .map(stratum =>
                members
                    .filter(ee.Filter.eq('stratum', stratum.stratum))
                    .map(sample => sample.set('id', toId({sample})))
                    .randomColumn('random', seed, 'uniform', ['id'])
                    .sort('random')
                    .limit(stratum.sampleSize)
            )
        ).flatten()
        : members
    return selected.map(sample =>
        sample
            .set('id', toId({sample}))
            .set('i', null)
            .set('j', null)
            .set('level', null)
            .set('sample', null)
            .set('random', null)
    )
}

export const exportSystematicToAssets$ = ({taskId, description, recipe, assetId, strategy, properties, destination, workspacePath, filenamePrefix, fileFormat}) => {
    const {model: {aoi, stratification, sampleAllocation: {allocation}, sampleArrangement}} = recipe
    const densityStrategy = sampleArrangement.sampleSizeStrategy
    const unstratified = isStratificationSkipped(stratification)
    // CLOSEST may intentionally land below the target; EXACT/OVER must reach the requested count (and fail
    // clearly if even the densest allowed grid can't).
    const requireFull = densityStrategy !== 'CLOSEST'
    // The base density is the area-tuned first guess; repair densifies only underproducing strata.
    const baseOffset = 0
    // Every temp candidate asset we attempt to materialize; the task-runner-aware backstop below deletes all
    // of them on success, error, and cancellation (idempotent).
    const materializedAssetIds = new Set()

    return tempTableAssetId$(taskId, assetId).pipe(
        switchMap(tempAssetId =>
            forkJoin({
                eeStratification: stratificationImage$(stratification),
                eeGeometry: toGeometry$(aoi)
            }).pipe(
                // Unstratified designs carry no per-stratum area; inject the AOI geometry area into the single
                // row before generating candidates or writing metadata. Stratified allocation is unchanged.
                switchMap(({eeStratification, eeGeometry}) =>
                    unstratifiedAllocation$({allocation, stratification, geometry: eeGeometry}).pipe(
                        switchMap(resolvedAllocation => {
                            const baseAssetId = candidateAssetId(tempAssetId, 'base')
                            const repairAssetId = candidateAssetId(tempAssetId, 'repair')
                            // Density/max-offset decisions read stratum.area, so maxOffsetOf must operate on the
                            // RESOLVED allocation - a no-area unstratified row would collapse the max offset to 0
                            // and silently cap densification. Unstratified analytical candidates are exact
                            // points, so their max offset is constrained only by minDistance (not by scale).
                            const maxOffsetOf = stratum => unstratified
                                ? unstratifiedMaxDensityOffset({...stratum, minDistance: sampleArrangement.minDistance})
                                : systematicStratumMaxOffset(stratum, sampleArrangement)
                            return systematicExportPlan$({
                                allocation: resolvedAllocation,
                                baseOffset,
                                maxOffsetOf,
                                requireFull,
                                baseAssetId,
                                repairAssetId,
                                exportUnfiltered$: exportUnfiltered$({eeStratification, eeGeometry, baseAssetId}),
                                count$: countSummary$({eeGeometry, eeStratification}),
                                candidatesOf,
                                finalExport$: finalExport$({eeGeometry, allocation: resolvedAllocation, eeStratification})
                            })
                        })
                    )
                )
            )
        ),
        // Backstop cleanup registered under taskId so the task runner waits for it even on cancellation:
        // best-effort delete every materialized temp asset (base and, if any, repair).
        finalizeObservable(deleteAllTempAssets$, taskId, 'Cleanup sampling design temp candidate assets')
    )

    function deleteAllTempAssets$() {
        const ids = [...materializedAssetIds]
        return ids.length
            ? concat(...ids.map(deleteTempAsset$)).pipe(swallow())
            : EMPTY
    }

    function exportUnfiltered$({eeStratification, eeGeometry, baseAssetId}) {
        return ({assetId: unfilteredAssetId, densityOffset, allocation: strata}) => {
            // The base asset carries all strata; anything else is the (denser) repair export. densityOffset
            // drives the sampling but is kept out of the user-visible EE task description / asset id.
            const kind = unfilteredAssetId === baseAssetId ? 'base' : 'repair'
            return defer(() => {
                // Track before starting the export: a cancel mid-export could still leave a partial asset,
                // and deleteTempAsset$ tolerates a missing asset.
                materializedAssetIds.add(unfilteredAssetId)
                const collection = unstratified
                    ? unstratifiedSystematicIndexCandidates({
                        allocation: strata,
                        region: eeGeometry,
                        sampleArrangement,
                        densityOffset
                    })
                    : systematicUnfilteredSamples({
                        allocation: strata,
                        eeStratification,
                        region: eeGeometry,
                        sampleArrangement,
                        densityOffset
                    })
                return tableToAsset$({
                    taskId,
                    collection,
                    description: candidateDescription(description, kind),
                    assetId: unfilteredAssetId
                })
            }).pipe(
                filter(({state}) => state !== 'COMPLETED')
            )
        }
    }

    // Selected-level counts read from a MATERIALIZED candidate asset's FeatureCollection (a cheap grouped
    // aggregate over the vector table), NOT the raster sample image - so it can't time out generating
    // candidates live.
    function countSummary$({eeGeometry, eeStratification}) {
        return ({assetId: countAssetId, allocation: strata, densityOffset}) => {
            const candidates = ee.FeatureCollection(countAssetId)
            // Convert candidates to their EXACT lattice points before counting so counts/levels reflect the
            // exported locations, not raster-snapped centroids. Unstratified: index cells over a padded
            // rectangle -> exact points (respects AOI). Stratified: raster candidates -> exact points, then
            // exact-point stratification membership (pre-count, so EXACT/OVER counts stay correct). Both count
            // over the already-MATERIALIZED candidate asset (a cheap getInfo, no final-count proof). Only the
            // unstratified GENERATION got cheaper (analytical index candidates); the stratified candidate asset
            // is still generated through the raster systematicUnfilteredSamples/reduceToVectors path, and this
            // stage adds the exact-membership work on top of it.
            const samples = unstratified
                ? materializeSystematicIndexGeometry({
                    candidates,
                    allocation: strata,
                    region: eeGeometry,
                    sampleArrangement,
                    densityOffset
                })
                : stratifiedExactMembers({
                    candidates,
                    allocation: strata,
                    region: eeGeometry,
                    eeStratification,
                    sampleArrangement,
                    densityOffset
                })
            return ee.getInfo$(
                systematicSelectionSummary(
                    selectSystematicLevels({
                        samples,
                        allocation: strata,
                        strategy: densityStrategy
                    })
                ),
                'selected-level summary count',
                0
            ).pipe(
                map(toDensitySummary)
            )
        }
    }

    function candidatesOf({baseAssetId, repairAssetId, repairedStrata}) {
        const baseSamples = ee.FeatureCollection(baseAssetId)
        return repairedStrata?.length
            ? mergeRepairedCandidates({baseSamples, repairSamples: ee.FeatureCollection(repairAssetId), repairedStrata})
            : baseSamples
    }

    function finalExport$({eeGeometry, allocation, eeStratification}) {
        return ({candidates, densityOffset, candidateDensityOffset = densityOffset, levelsByStratum, repairedStrata}) => {
            const filteredSamples = unstratified
                ? filterUnstratifiedIndexSamples({
                    region: eeGeometry,
                    candidates,
                    allocation,
                    strategy: densityStrategy,
                    seed: sampleArrangement.seed,
                    densityOffset: candidateDensityOffset,
                    levelsByStratum
                })
                : filterStratifiedExactSamples({
                    region: eeGeometry,
                    candidates,
                    allocation,
                    strategy: densityStrategy,
                    seed: sampleArrangement.seed,
                    baseOffset: densityOffset,
                    repairOffset: candidateDensityOffset,
                    repairedStrata,
                    levelsByStratum,
                    eeStratification,
                    sampleArrangement
                })
            // selectedDensityOffset is collection-level metadata and records the base offset. If a repair
            // export was used, repaired strata were drawn from a denser internal repair grid that is not
            // represented per row in the current export schema. Therefore selectedDensityOffset alone is not
            // a complete reproduction recipe for repaired rows.
            //
            // Asset exports keep rows minimal (id/stratum/selectedLevel) with reproduction/allocation
            // metadata at the collection level; SEPAL/CSV keeps full per-row columns (sidecars are a
            // follow-up).
            const samples = finalizeSystematicSamples({filteredSamples, allocation, sampleArrangement, densityOffset, rowMetadata: destination === 'SEPAL'})
                .set(formatProperties(properties))
            // No final validateSampleCounts$: proving the filtered count would re-run the heavy computation
            // and can time out. Sufficiency was already checked over the materialized candidate assets.
            return destination === 'SEPAL'
                ? tableToSepal$(taskId, {
                    collection: samples,
                    description,
                    workspacePath,
                    filenamePrefix,
                    fileFormat,
                    selectors: SYSTEMATIC_EXPORT_PROPERTY_NAMES
                })
                : tableToAsset$({
                    taskId,
                    collection: samples,
                    description,
                    assetId,
                    strategy
                })
        }
    }

    function filterUnstratifiedIndexSamples({region, candidates, allocation, strategy, seed, densityOffset, levelsByStratum}) {
        const filteredByLevel = ee.FeatureCollection(allocation
            .map(stratum => {
                const level = ee.Number(levelsByStratum?.[String(stratum.stratum)])
                return candidates
                    .filter(ee.Filter.eq('stratum', stratum.stratum))
                    .filter(ee.Filter.gte('level', level))
                    .map(sample => sample.set('selectedLevel', level))
            })
        ).flatten()
        const insideAoi = materializeSystematicIndexGeometry({
            candidates: filteredByLevel,
            allocation,
            region,
            sampleArrangement,
            densityOffset
        })
        const selected = strategy === 'EXACT'
            ? ee.FeatureCollection(allocation
                .map(stratum =>
                    insideAoi
                        .filter(ee.Filter.eq('stratum', stratum.stratum))
                        .randomColumn('random', seed, 'uniform', ['idkey'])
                        .sort('random')
                        .limit(stratum.sampleSize)
                )
            ).flatten()
            : insideAoi
        return selected.map(sample =>
            sample
                .set('id', toId({sample}))
                // Keep helper-only properties out of row-metadata exports; asset exports would select them
                // away anyway, but SEPAL/CSV row metadata should stay aligned with the existing selectors.
                .set('i', null)
                .set('j', null)
                .set('idkey', null)
                .set('level', null)
                .set('sample', null)
                .set('random', null)
        )
    }

    function deleteTempAsset$(id) {
        return ee.deleteAsset$(id).pipe(
            catchError(() => EMPTY),
            swallow()
        )
    }
}
