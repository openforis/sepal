import {catchError, concat, defer, EMPTY, filter, forkJoin, map, switchMap, throwError} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {effectiveArrangement} from '#sepal/ee/samplingDesign/effectiveArrangement'
import {SYSTEMATIC_EXPORT_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {finalizeSystematicSamples, mergeRepairedCandidates, systematicStratumMaxOffset, toDensitySummary} from '#sepal/ee/samplingDesign/samples'
import {stratificationImage$} from '#sepal/ee/samplingDesign/stratificationImage'
import {isStratificationSkipped} from '#sepal/ee/samplingDesign/stratificationSkip'
import {gridPixelSize, unstratifiedMaxDensityOffset} from '#sepal/ee/samplingDesign/systematicLatticeMath'
import {selectSystematicLevels, stratifiedSystematicExactCandidates, stratifiedSystematicFinalSamples, systematicSelectionSummary} from '#sepal/ee/samplingDesign/systematicSampling'
import {unstratifiedAllocation$} from '#sepal/ee/samplingDesign/unstratifiedArea'
import {materializeSystematicIndexGeometry, unstratifiedSystematicIndexCandidates} from '#sepal/ee/samplingDesign/unstratifiedSystematicSampling'
import {getSampleCounts$} from '#sepal/ee/samplingDesign/validateSampleCounts'
import {effectiveMinSamplesPerStratum} from '#sepal/recipe/samplingDesign/minSamples'
import {resolveSamplingGrid} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {finalizeObservable, swallow} from '#sepal/rxjs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {finalCountError, gateFinalExport$} from './finalValidationGate.js'
import {stratifiedGridError, stratifiedMinDistanceError, unstratifiedSystematicGridError} from './samplingGridValidation.js'
import {samplingDesignPreflightError} from './samplingPreflight.js'
import {candidateAssetId, candidateDescription} from './systematicExportNames.js'
import {systematicExportPlan$} from './systematicExportPlan.js'
import {tempTableAssetId$} from './tempTableAsset.js'

// Systematic export materializes unfiltered candidate samples to temporary EE table assets, then reads them
// back to filter. tempTableAssetId$ (shared with stratified random) supplies the clearly-temporary prefix;
// candidateAssetId adds a plain per-kind suffix.
export const exportSystematicToAssets$ = ({taskId, description, recipe, assetId, strategy, properties, destination, workspacePath, filenamePrefix, fileFormat}) => {
    const {model: {aoi, stratification, sampleAllocation: {allocation}}} = recipe
    const unstratified = isStratificationSkipped(stratification)
    const configuredArrangement = effectiveArrangement(recipe.model)
    const densityStrategy = configuredArrangement.sampleSizeStrategy
    // CLOSEST may intentionally land below the target; EXACT/OVER must reach the requested count (and fail
    // clearly if even the densest allowed grid can't).
    const requireFull = densityStrategy !== 'CLOSEST'
    // The base density is the area-tuned first guess; repair densifies only underproducing strata.
    const baseOffset = 0
    // Every temp candidate asset we attempt to materialize; the task-runner-aware backstop below deletes all
    // of them on success, error, and cancellation (idempotent).
    const materializedAssetIds = new Set()

    // Enforce the sampling-grid CRS contract BEFORE any EE graph is built, with a structured error. The lattice
    // assumes projected metre coordinates; the candidate function stays projection-agnostic, so this boundary is
    // where unsupported CRSs are rejected. Stratified needs a supported CRS and a positive Stratification Scale;
    // unstratified is analytical, so it only needs a supported CRS.
    const gridError = unstratified
        ? unstratifiedSystematicGridError(configuredArrangement)
        : stratifiedGridError(configuredArrangement)
    if (gridError) {
        return throwError(() => gridError)
    }

    // The raster spacing floor applies to STRATIFIED systematic only: the lattice sits on the stratification
    // grid. Checked after the grid definition is known valid, so one bad grid raises one error.
    const minDistanceError = unstratified ? null : stratifiedMinDistanceError(configuredArrangement)
    if (minDistanceError) {
        return throwError(() => minDistanceError)
    }

    // Validated as configured (option ids); resolved to EE-ready CRS for every graph built below.
    const sampleArrangement = resolveSamplingGrid(configuredArrangement)

    // Enforce the minimum-sample contract on the submitted recipe BEFORE resolving temp asset ids or building
    // any EE graph, so an impossible design fails immediately instead of after an expensive export.
    const preflightError = samplingDesignPreflightError(recipe)
    if (preflightError) {
        return throwError(() => preflightError)
    }

    // Resolved configuration the final-count advice reasons about: only actions that can actually help are
    // recommended, so the advice needs the real spacing and grid the design was submitted with.
    const validationConfig = {
        arrangementStrategy: 'SYSTEMATIC',
        sampleSizeStrategy: densityStrategy,
        allocationStrategy: recipe.model.sampleAllocation?.allocationStrategy,
        estimateSampleSize: !!recipe.model.sampleAllocation?.estimateSampleSize,
        manual: recipe.model.sampleAllocation?.manual,
        effectiveMinimum: effectiveMinSamplesPerStratum(recipe.model.sampleAllocation || {}),
        minDistance: configuredArrangement.minDistance,
        pixelSize: gridPixelSize(configuredArrangement),
        unstratified
    }

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
                            // Unstratified area is injected above; maxOffsetOf depends on stratum.area.
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
                                count$: countSummary$({eeGeometry}),
                                candidatesOf,
                                finalExport$: finalExport$({eeGeometry, allocation: resolvedAllocation}),
                                underproductionError: ({counts, strata}) =>
                                    finalCountError({counts, allocation: strata, config: validationConfig})
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
                    : stratifiedSystematicExactCandidates({
                        allocation: strata,
                        stratification: eeStratification,
                        region: eeGeometry,
                        grid: {crs: sampleArrangement.crs, scale: sampleArrangement.scale},
                        sampleArrangement: {minDistance: sampleArrangement.minDistance, gridOrigin: sampleArrangement.gridOrigin, seed: sampleArrangement.seed},
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

    // Counts read from materialized candidate assets, not from live raster generation.
    function countSummary$({eeGeometry}) {
        return ({assetId: countAssetId, allocation: strata, densityOffset}) => {
            const candidates = ee.FeatureCollection(countAssetId)
            // The stratified candidate asset already carries exact geometry, exact-in-AOI membership and the
            // persisted nested level, so counting reads its level/stratum columns directly - no geometry
            // materialization and no re-filtering. Unstratified still materializes its index geometry.
            const samples = unstratified
                ? materializeSystematicIndexGeometry({
                    candidates,
                    allocation: strata,
                    region: eeGeometry,
                    sampleArrangement,
                    densityOffset
                })
                : candidates
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

    function finalExport$({eeGeometry, allocation}) {
        return ({candidates, densityOffset, candidateDensityOffset = densityOffset, levelsByStratum}) => {
            // Stratified: select over the persisted candidate asset (already exact geometry, exact-in-AOI, with
            // persisted level) using the levels the count/repair stage supplied. Repaired candidates already
            // carry geometry at their repair density, so no region/offset/repairedStrata are threaded here.
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
                : stratifiedSystematicFinalSamples({
                    candidates,
                    allocation,
                    strategy: densityStrategy,
                    seed: sampleArrangement.seed,
                    levelsByStratum
                })
            // selectedDensityOffset records the base offset; repaired strata may come from a denser asset.
            const samples = finalizeSystematicSamples({filteredSamples, allocation, sampleArrangement, densityOffset, rowMetadata: destination === 'SEPAL'})
                .set(formatProperties(properties))
            const export$ = destination === 'SEPAL'
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
            // Final safety guard for both stratified and unstratified systematic: count the SELECTED final
            // collection and gate the export on the minimum-sample contract, so validation always happens
            // before the export starts.
            return gateFinalExport$({
                counts$: getSampleCounts$(filteredSamples, 'systematic final validation count'),
                allocation,
                config: validationConfig,
                export$
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
                .set('id', sample.getString('idkey'))
                // Keep helper-only candidate fields out of row-metadata exports.
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
