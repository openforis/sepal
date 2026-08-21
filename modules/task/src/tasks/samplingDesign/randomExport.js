import {catchError, concat, defer, EMPTY, map, of, switchMap, tap, throwError} from 'rxjs'

import {sanitizeEarthEngineTaskName} from '#sepal/earthEngineExportNames'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {effectiveArrangement, resolveArrangementGrids} from '#sepal/ee/samplingDesign/effectiveArrangement'
import {EXPORT_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {unstratifiedRandomSamples$} from '#sepal/ee/samplingDesign/samples'
import {initialThresholds, repairStep} from '#sepal/ee/samplingDesign/sparseRandomRepair'
import {inspectCandidates$, selectStratifiedRandomSamples, sparseRandomCandidates} from '#sepal/ee/samplingDesign/sparseRandomSampling'
import {stratificationImage$} from '#sepal/ee/samplingDesign/stratificationImage'
import {isStratificationSkipped} from '#sepal/ee/samplingDesign/stratificationSkip'
import {unstratifiedAllocation$} from '#sepal/ee/samplingDesign/unstratifiedArea'
import {getSampleCounts$} from '#sepal/ee/samplingDesign/validateSampleCounts'
import {getLogger} from '#sepal/log'
import {effectiveMinSamplesPerStratum} from '#sepal/recipe/samplingDesign/minSamples'
import {gridPixelSize} from '#sepal/recipe/samplingDesign/samplingGrid'
import {finalizeObservable, swallow} from '#sepal/rxjs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'
import {progress} from '#task/rxjs/operators'

import {formatProperties} from '../formatProperties.js'
import {finalCountError} from './finalValidationGate.js'
import {stratifiedGridError} from './samplingGridValidation.js'
import {samplingDesignPreflightError} from './samplingPreflight.js'
import {tempTableAssetId$} from './tempTableAsset.js'

const log = getLogger('samplingDesign')

// Coarse stage-level task progress for the random exports, mirroring the systematic UX. Sampling-Design text lives
// here, not in the generic table-export helpers.
const RANDOM_PROGRESS = {
    prepareCandidates: {messageKey: 'tasks.samplingDesign.random.progress.prepareCandidates', defaultMessage: 'Finding random sample locations'},
    checkCandidates: {messageKey: 'tasks.samplingDesign.random.progress.checkCandidates', defaultMessage: 'Checking random sample locations'},
    exportFinal: {messageKey: 'tasks.samplingDesign.random.progress.exportFinal', defaultMessage: 'Exporting samples'}
}

const randomStage$ = descriptor => of(undefined).pipe(progress(descriptor))

export const exportRandomToAssets$ = ({taskId, description, recipe, assetId, strategy, destination, workspacePath, filenamePrefix, fileFormat, properties = {}}) => {
    const {model: {aoi, stratification, sampleAllocation: {allocation}}} = recipe
    const unstratified = isStratificationSkipped(stratification)
    const configuredArrangement = effectiveArrangement(recipe.model)
    const rowMetadata = destination === 'SEPAL'

    // Unstratified Random carries no grid at all; stratified Random carries both, so both are validated - a
    // curated Arrangement CRS for placement, a non-blank Stratification CRS and positive Scale for the classes.
    const gridError = unstratified ? null : stratifiedGridError(configuredArrangement)
    if (gridError) {
        return throwError(() => gridError)
    }
    // Reject an impossible design before any EE graph is built, for both modes.
    const preflightError = samplingDesignPreflightError(recipe)
    if (preflightError) {
        return throwError(() => preflightError)
    }

    // Random sampling has no systematic sample-size strategy, so requested counts are always required. Grid and
    // spacing settings are Systematic-only, so the advice has none of them to reason about here.
    const validationConfig = {
        arrangementStrategy: 'RANDOM',
        allocationStrategy: recipe.model.sampleAllocation?.allocationStrategy,
        estimateSampleSize: !!recipe.model.sampleAllocation?.estimateSampleSize,
        manual: recipe.model.sampleAllocation?.manual,
        effectiveMinimum: effectiveMinSamplesPerStratum(recipe.model.sampleAllocation || {}),
        // Advice composition only: an unstratified random design must not be told to revise/merge a
        // stratification. Does not affect sampling, allocation or export behavior.
        unstratified
    }

    // Resolve both grids to EE-ready form; unstratified random carries neither, so nothing is resolved.
    const sampleArrangement = resolveArrangementGrids(configuredArrangement)

    // Unstratified designs carry no per-stratum area; inject the AOI geometry area into the single row before
    // generating samples or writing metadata. Stratified allocation passes through unchanged.
    const withRegionAllocation$ = build =>
        toGeometry$(aoi).pipe(
            switchMap(region =>
                unstratifiedAllocation$({allocation, stratification, geometry: region}).pipe(
                    switchMap(resolvedAllocation => build({region, resolvedAllocation}))
                )
            )
        )

    const finalTableToSepal$ = (collection, selectors) =>
        tableToSepal$(taskId, {collection, description, workspacePath, filenamePrefix, fileFormat, selectors})

    return unstratified
        ? exportUnstratified$()
        : exportStratified$()

    // Unstratified: FeatureCollection.randomPoints draws exactly the requested count, so there is nothing to
    // validate - build the exact-count graph and export it directly. No temp asset, no count, no check stage.
    function exportUnstratified$() {
        return withRegionAllocation$(({region, resolvedAllocation}) =>
            concat(
                randomStage$(RANDOM_PROGRESS.prepareCandidates),
                unstratifiedRandomSamples$({allocation: resolvedAllocation, region, sampleArrangement, rowMetadata}).pipe(
                    map(collection => collection.set(formatProperties(properties))),
                    switchMap(samples => concat(
                        randomStage$(RANDOM_PROGRESS.exportFinal),
                        destination === 'SEPAL'
                            ? finalTableToSepal$(samples, EXPORT_PROPERTY_NAMES)
                            : tableToAsset$({taskId, collection: samples, description, assetId, strategy})
                    ))
                )
            )
        )
    }

    // Stratified: sparse rank-based. Each eligible equal-area cell at Stratification Scale gets one random rank;
    // materialize the sub-threshold candidates to a temporary asset, count that READY asset, and repair short
    // strata by materializing additional disjoint rank intervals with the SAME rank field. Then select the lowest
    // requested ranks per stratum, export the selection to its own temporary asset, validate its counts, and only
    // then publish. getSampleCounts$ / inspection always read a ready asset, never the lazy raster graph.
    function exportStratified$() {
        // Every temp asset (candidates, additional intervals, selection) is tracked before its export starts, so
        // the finalize backstop deletes whatever remains on success, repair, underproduction, export/promotion
        // failure and cancellation. A promoted selection id is dropped from the set by the rename.
        const tempAssetIds = new Set()
        // Placement is the Arrangement CRS; the cell size is the Stratification pixel size. sparseRandomCandidates
        // itself is untouched - the two-grid delta is this argument and nothing else.
        const grid = {crs: sampleArrangement.arrangementGrid.crs, scale: gridPixelSize(sampleArrangement.stratificationGrid)}
        const seed = sampleArrangement.seed
        return tempTableAssetId$(taskId, assetId).pipe(
            switchMap(prefix =>
                withRegionAllocation$(({region, resolvedAllocation}) =>
                    stratificationImage$(stratification, sampleArrangement.stratificationGrid).pipe(
                        switchMap(eeStratification =>
                            sparseFlow$({prefix, region, allocation: resolvedAllocation, eeStratification, grid, seed, tempAssetIds})
                        )
                    )
                )
            ),
            finalizeObservable(() => deleteTempAssets$(tempAssetIds), taskId, 'Cleanup sampling design temp random assets')
        )
    }

    function sparseFlow$({prefix, region, allocation, eeStratification, grid, seed, tempAssetIds}) {
        const thresholds = initialThresholds({allocation, scale: grid.scale, multiplier: 2})
        const zeros = allocation.map(() => 0)
        const candidateAssetId = `${prefix}_candidates`

        const exportCandidates$ = ({assetId: candidateId, loThresholds, hiThresholds, kind}) =>
            defer(() => {
                const candidates = sparseRandomCandidates({stratification: eeStratification, region, grid, seed, loThresholds, hiThresholds, allocation})
                tempAssetIds.add(candidateId)
                return tableToAsset$({taskId, collection: candidates, description: candidateDescription(kind), assetId: candidateId, strategy: 'create'})
            })

        const inspect$ = candidateId =>
            defer(() => inspectCandidates$(ee.FeatureCollection(candidateId), {allocation, description: 'stratified random candidate inspection'}))

        const repairAndFinalize$ = ({counts, thresholds: currentThresholds, candidateAssetIds, round}) => {
            const step = repairStep({thresholds: currentThresholds, counts, allocation, round})
            if (step.done) {
                return finalize$({candidateAssetIds})
            }
            if (step.underproduction) {
                return throwError(() => finalCountError({counts, allocation, config: validationConfig}))
            }
            if (step.repairLimit) {
                // Distinct from a statistical shortfall: the doubling schedule did not reach threshold 1 within the
                // round budget (only reachable with a pathological area estimate). Internal, not user advice.
                return throwError(() => new Error('Sparse random repair did not reach threshold 1 within the round budget'))
            }
            const repairAssetId = `${prefix}_additional_candidates_${round + 1}`
            return concat(
                randomStage$(RANDOM_PROGRESS.prepareCandidates),
                exportCandidates$({assetId: repairAssetId, loThresholds: step.loThresholds, hiThresholds: step.hiThresholds, kind: 'repair'}),
                randomStage$(RANDOM_PROGRESS.checkCandidates),
                inspect$(repairAssetId).pipe(
                    switchMap(({countsByStratum}) => {
                        const merged = {}
                        allocation.forEach(({stratum}) => {
                            merged[stratum] = (Number(counts[stratum]) || 0) + (Number(countsByStratum[stratum]) || 0)
                        })
                        return repairAndFinalize$({
                            counts: merged,
                            thresholds: step.nextThresholds,
                            candidateAssetIds: [...candidateAssetIds, repairAssetId],
                            round: round + 1
                        })
                    })
                )
            )
        }

        const finalize$ = ({candidateAssetIds}) => {
            const selectedAssetId = `${prefix}_selected`
            const mergedCandidates = candidateAssetIds
                .map(id => ee.FeatureCollection(id))
                .reduce((accumulated, collection) => accumulated.merge(collection))
            const finalCollection = selectStratifiedRandomSamples({candidates: mergedCandidates, allocation, sampleArrangement, rowMetadata})
                .set(formatProperties(properties))
            return concat(
                randomStage$(RANDOM_PROGRESS.exportFinal),
                defer(() => {
                    tempAssetIds.add(selectedAssetId)
                    return tableToAsset$({taskId, collection: finalCollection, description: selectedDescription(), assetId: selectedAssetId, strategy: 'create'})
                }),
                validateSelected$(selectedAssetId),
                publish$(selectedAssetId)
            )
        }

        const validateSelected$ = selectedAssetId =>
            getSampleCounts$(ee.FeatureCollection(selectedAssetId), 'stratified random final validation count').pipe(
                map(counts => {
                    const error = finalCountError({counts, allocation, config: validationConfig})
                    if (error) {
                        throw error
                    }
                    return counts
                }),
                swallow()
            )

        const publish$ = selectedAssetId =>
            defer(() => destination === 'SEPAL'
                ? finalTableToSepal$(ee.FeatureCollection(selectedAssetId), EXPORT_PROPERTY_NAMES)
                : promoteTempAsset$(selectedAssetId, tempAssetIds))

        return concat(
            randomStage$(RANDOM_PROGRESS.prepareCandidates),
            exportCandidates$({assetId: candidateAssetId, loThresholds: zeros, hiThresholds: thresholds, kind: 'base'}),
            randomStage$(RANDOM_PROGRESS.checkCandidates),
            inspect$(candidateAssetId).pipe(
                switchMap(({countsByStratum}) =>
                    repairAndFinalize$({counts: countsByStratum, thresholds, candidateAssetIds: [candidateAssetId], round: 0})
                )
            )
        )
    }

    // Promote the validated selected table to the requested asset id by rename instead of re-exporting, preserving
    // its rows and metadata. create/replace semantics apply only here, AFTER validation, so a failed validation
    // never destroys an existing destination.
    function promoteTempAsset$(selectedAssetId, tempAssetIds) {
        return concat(
            ee.createParentFolder$(assetId, 1).pipe(swallow()),
            strategy === 'replace'
                ? ee.deleteAssetRecursive$(assetId, {include: ['ImageCollection', 'Image', 'Table']}).pipe(swallow())
                : EMPTY,
            ee.renameAsset$(selectedAssetId, assetId).pipe(
                // The selected path no longer exists after a successful rename; drop it so cleanup skips it.
                tap({complete: () => tempAssetIds.delete(selectedAssetId)}),
                swallow()
            )
        )
    }

    function deleteTempAssets$(tempAssetIds) {
        const ids = [...tempAssetIds]
        return ids.length
            ? concat(...ids.map(deleteTempAsset$)).pipe(swallow())
            : EMPTY
    }

    // Best effort: a missing asset (already promoted) is fine; a genuine failure is logged with the temp id so a
    // stray asset is discoverable, but never masks the primary (e.g. under-production) error.
    function deleteTempAsset$(id) {
        return ee.deleteAsset$(id).pipe(
            catchError(error => {
                log.warn(`Failed to delete temporary sampling design asset ${id}`, error)
                return EMPTY
            })
        )
    }

    // Plain EE-task descriptions for the temporary materializations; distinct from the final export and free of
    // internal terminology.
    function candidateDescription(kind) {
        return sanitizeEarthEngineTaskName(`${kind === 'repair' ? 'Prepare additional sample candidates' : 'Prepare sample candidates'}: ${description}`)
    }
    function selectedDescription() {
        return sanitizeEarthEngineTaskName(`Prepare samples: ${description}`)
    }
}
