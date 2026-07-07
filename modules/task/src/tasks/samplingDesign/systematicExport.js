import moment from 'moment'
import {catchError, concat, defer, EMPTY, filter, forkJoin, map, of, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {SYSTEMATIC_EXPORT_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {finalizeSystematicSamples, mergeRepairedCandidates, systematicStratumMaxOffset, systematicUnfilteredSamples, toDensitySummary} from '#sepal/ee/samplingDesign/samples'
import {stratificationImage$} from '#sepal/ee/samplingDesign/stratificationImage'
import {filterSamples, selectSystematicLevels, systematicSelectionSummary} from '#sepal/ee/samplingDesign/systematicSampling'
import {finalizeObservable, swallow} from '#sepal/rxjs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {systematicExportPlan$} from './systematicExportPlan.js'

// Systematic export materializes unfiltered candidate samples to temporary EE table assets, then reads them
// back to filter. GEE asset export derives the temp id from the target assetId; SEPAL export has no assetId,
// so create a temp id under the user's first EE asset root with a safe generated name.
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
    const {model: {aoi, stratification, sampleAllocation: {allocation}, sampleArrangement}} = recipe
    const densityStrategy = sampleArrangement.sampleSizeStrategy
    // CLOSEST may intentionally land below the target; EXACT/OVER must reach the requested count (and fail
    // clearly if even the densest allowed grid can't).
    const requireFull = densityStrategy !== 'CLOSEST'
    // The base density is the area-tuned first guess; repair densifies only underproducing strata.
    const baseOffset = 0
    // Each stratum's own densest allowed offset - the repair decision clamps per failing stratum, so a
    // stratum already at its minimum-distance limit is recognised as non-repairable rather than dragged
    // denser by another stratum's headroom.
    const maxOffsetOf = stratum => systematicStratumMaxOffset(stratum, sampleArrangement)
    // Every temp candidate asset we attempt to materialize; the task-runner-aware backstop below deletes all
    // of them on success, error, and cancellation (idempotent).
    const materializedAssetIds = new Set()

    return tempTableAssetId$(taskId, assetId).pipe(
        switchMap(tempAssetId =>
            forkJoin({
                eeStratification: stratificationImage$(stratification),
                eeGeometry: toGeometry$(aoi)
            }).pipe(
                switchMap(({eeStratification, eeGeometry}) =>
                    systematicExportPlan$({
                        allocation,
                        baseOffset,
                        maxOffsetOf,
                        requireFull,
                        baseAssetId: `${tempAssetId}_base`,
                        repairAssetId: `${tempAssetId}_repair`,
                        exportUnfiltered$: exportUnfiltered$({eeStratification, eeGeometry}),
                        count$: countSummary$,
                        candidatesOf,
                        finalExport$: finalExport$({eeGeometry})
                    })
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

    function exportUnfiltered$({eeStratification, eeGeometry}) {
        return ({assetId: unfilteredAssetId, densityOffset, allocation: strata}) => defer(() => {
            // Track before starting the export: a cancel mid-export could still leave a partial asset, and
            // deleteTempAsset$ tolerates a missing asset.
            materializedAssetIds.add(unfilteredAssetId)
            return tableToAsset$({
                taskId,
                collection: systematicUnfilteredSamples({allocation: strata, eeStratification, region: eeGeometry, sampleArrangement, densityOffset}),
                description: `${description}_unfiltered_${densityOffset}`,
                assetId: unfilteredAssetId
            })
        }).pipe(
            filter(({state}) => state !== 'COMPLETED')
        )
    }

    // Selected-level counts read from a MATERIALIZED candidate asset's FeatureCollection (a cheap grouped
    // aggregate over the vector table), NOT the raster sample image - so it can't time out generating
    // candidates live.
    function countSummary$({assetId: countAssetId, allocation: strata}) {
        return ee.getInfo$(
            systematicSelectionSummary(
                selectSystematicLevels({
                    samples: ee.FeatureCollection(countAssetId),
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

    function candidatesOf({baseAssetId, repairAssetId, repairedStrata}) {
        const baseSamples = ee.FeatureCollection(baseAssetId)
        return repairedStrata?.length
            ? mergeRepairedCandidates({baseSamples, repairSamples: ee.FeatureCollection(repairAssetId), repairedStrata})
            : baseSamples
    }

    function finalExport$({eeGeometry}) {
        return ({candidates, densityOffset}) => {
            const filteredSamples = filterSamples({
                region: eeGeometry,
                samples: candidates,
                allocation,
                strategy: densityStrategy,
                seed: sampleArrangement.seed
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

    function deleteTempAsset$(id) {
        return ee.deleteAsset$(id).pipe(
            catchError(() => EMPTY),
            swallow()
        )
    }
}
