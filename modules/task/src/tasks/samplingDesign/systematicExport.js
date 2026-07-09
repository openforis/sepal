import moment from 'moment'
import {catchError, concat, defer, EMPTY, filter, forkJoin, map, of, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {SYSTEMATIC_EXPORT_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {finalizeSystematicSamples, mergeRepairedCandidates, systematicStratumMaxOffset, systematicUnfilteredSamples, toDensitySummary} from '#sepal/ee/samplingDesign/samples'
import {stratificationImage$} from '#sepal/ee/samplingDesign/stratificationImage'
import {filterSamples, selectSystematicLevels, systematicSelectionSummary} from '#sepal/ee/samplingDesign/systematicSampling'
import {unstratifiedAllocation$} from '#sepal/ee/samplingDesign/unstratifiedArea'
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

export const exportSystematicToAssets$ = ({taskId, description, recipe, assetId, strategy, properties, destination, workspacePath, filenamePrefix, fileFormat}) => {
    const {model: {aoi, stratification, sampleAllocation: {allocation}, sampleArrangement}} = recipe
    const densityStrategy = sampleArrangement.sampleSizeStrategy
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
                            // and silently cap densification. Defined here so it's tied to resolvedAllocation.
                            const maxOffsetOf = stratum => systematicStratumMaxOffset(stratum, sampleArrangement)
                            return systematicExportPlan$({
                                allocation: resolvedAllocation,
                                baseOffset,
                                maxOffsetOf,
                                requireFull,
                                baseAssetId,
                                repairAssetId,
                                exportUnfiltered$: exportUnfiltered$({eeStratification, eeGeometry, baseAssetId}),
                                count$: countSummary$,
                                candidatesOf,
                                finalExport$: finalExport$({eeGeometry, allocation: resolvedAllocation})
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
                return tableToAsset$({
                    taskId,
                    collection: systematicUnfilteredSamples({allocation: strata, eeStratification, region: eeGeometry, sampleArrangement, densityOffset}),
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

    function finalExport$({eeGeometry, allocation}) {
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
