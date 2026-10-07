import {concat, defer, EMPTY, forkJoin, last, map, of, switchMap, throwError} from 'rxjs'

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
import {formatProperties} from '#sepal/formatProperties'
import {effectiveMinSamplesPerStratum} from '#sepal/recipe/samplingDesign/minSamples'
import {gridPixelSize} from '#sepal/recipe/samplingDesign/samplingGrid'
import {swallow} from '#sepal/rxjs'

import {startTableToAssetExport$} from '../export/toAsset.js'
import {startTableToWorkspaceExport$} from '../export/toWorkspace.js'
import {finalCountError} from './finalValidationGate.js'
import {RANDOM_PROGRESS as PROGRESS} from './progress.js'
import {stratifiedGridError} from './samplingGridValidation.js'
import {samplingDesignPreflightError} from './samplingPreflight.js'
import {tempAssetPrefix$} from './tempAssets.js'

// One stage of a random export. Unstratified: a single exact-count export. Stratified (sparse rank-based):
// candidates -> inspect -> repair rounds with disjoint rank intervals -> selected -> validate -> publish. Every
// count reads a materialised temp asset, never the lazy graph, so only plain JSON crosses steps.
export const randomStep$ = (request, {sepalUser}) => defer(() => {
    const {state, recipe} = request
    if (!state) {
        const gateError = randomGateError(recipe)
        return gateError
            ? throwError(() => gateError)
            : new RandomSteps(request, {sepalUser}).start$()
    }
    const steps = new RandomSteps(request, {sepalUser})
    switch (state.stage) {
        case 'candidates':
            return steps.afterCandidates$(state)
        case 'selected':
            return steps.afterSelected$(state)
        case 'final':
            return of({state, progress: [], action: 'done'})
        default:
            return throwError(() => new Error(`Unknown random sampling stage: ${state.stage}`))
    }
})

// Unstratified Random carries no grid at all; stratified Random places samples on a curated Arrangement CRS and
// reads the classes on a non-blank Stratification CRS at a positive scale.
const randomGateError = recipe => {
    const unstratified = isStratificationSkipped(recipe.model.stratification)
    return (unstratified ? null : stratifiedGridError(effectiveArrangement(recipe.model)))
        || samplingDesignPreflightError(recipe)
}

class RandomSteps {
    #request
    #sepalUser
    #unstratified
    #sampleArrangement
    #validationConfig

    constructor(request, {sepalUser}) {
        const {model} = request.recipe
        this.#request = request
        this.#sepalUser = sepalUser
        this.#unstratified = isStratificationSkipped(model.stratification)
        this.#sampleArrangement = resolveArrangementGrids(effectiveArrangement(model))
        // Random has no sample-size strategy, so the requested counts are always required, and no grid or spacing
        // the advice could reason about.
        this.#validationConfig = {
            arrangementStrategy: 'RANDOM',
            allocationStrategy: model.sampleAllocation?.allocationStrategy,
            estimateSampleSize: !!model.sampleAllocation?.estimateSampleSize,
            manual: model.sampleAllocation?.manual,
            effectiveMinimum: effectiveMinSamplesPerStratum(model.sampleAllocation || {}),
            unstratified: this.#unstratified
        }
    }

    start$() {
        return this.#unstratified
            ? this.#startUnstratified$()
            : this.#startStratified$()
    }

    afterCandidates$(state) {
        const {allocation, candidateAssetIds, round} = state
        const latestAssetId = candidateAssetIds[candidateAssetIds.length - 1]
        return inspectCandidates$(ee.FeatureCollection(latestAssetId), {allocation, description: 'stratified random candidate inspection'}).pipe(
            switchMap(({countsByStratum}) => {
                // The base inspection is the running count; each repair interval is disjoint, so it adds to it.
                const counts = round === 0 ? countsByStratum : addCounts({counts: state.counts, added: countsByStratum, allocation})
                const step = repairStep({thresholds: state.thresholds, counts, allocation, round})
                if (step.done) {
                    return this.#startSelected$({...state, counts})
                }
                if (step.underproduction) {
                    throw finalCountError({counts, allocation, config: this.#validationConfig})
                }
                if (step.repairLimit) {
                    // Not a statistical shortfall: the doubling schedule did not reach threshold 1 within the round
                    // budget, which only a pathological area estimate can cause. Internal, not user advice.
                    throw new Error('Sparse random repair did not reach threshold 1 within the round budget')
                }
                return this.#startRepair$({...state, counts}, step)
            })
        )
    }

    // The selection is validated as a ready asset, and only then published: create/replace act on the user's asset
    // after validation, so a failed validation never destroys an existing destination.
    afterSelected$(state) {
        const selectedAssetId = selectedAssetIdOf(state.prefix)
        return getSampleCounts$(ee.FeatureCollection(selectedAssetId), 'stratified random final validation count').pipe(
            switchMap(counts => {
                const error = finalCountError({counts, allocation: state.allocation, config: this.#validationConfig})
                if (error) {
                    throw error
                }
                return this.#toWorkspace()
                    ? this.#startWorkspaceExport$(ee.FeatureCollection(selectedAssetId)).pipe(
                        map(started => ({state: {...state, stage: 'final'}, progress: [], ...started}))
                    )
                    : this.#promote$(selectedAssetId).pipe(
                        map(() => ({
                            // The renamed selection no longer exists under its temp id, so cleanup skips it.
                            state: {...state, stage: 'final', tempAssetIds: state.tempAssetIds.filter(id => id !== selectedAssetId)},
                            progress: [],
                            action: 'done'
                        }))
                    )
            })
        )
    }

    #startUnstratified$() {
        return this.#region$().pipe(
            switchMap(({eeGeometry, allocation}) =>
                unstratifiedRandomSamples$({allocation, region: eeGeometry, sampleArrangement: this.#sampleArrangement, rowMetadata: this.#toWorkspace()})
            ),
            map(collection => collection.set(this.#formattedProperties())),
            switchMap(samples => this.#startFinalExport$(samples)),
            map(started => ({
                state: {kind: 'random', stage: 'final', tempAssetIds: []},
                progress: [PROGRESS.prepareCandidates, PROGRESS.exportFinal],
                ...started
            }))
        )
    }

    #startStratified$() {
        const {assetId} = this.#request
        return tempAssetPrefix$({assetId}).pipe(
            switchMap(prefix => this.#region$().pipe(
                switchMap(({allocation}) => {
                    const thresholds = initialThresholds({allocation, scale: this.#grid().scale, multiplier: 2})
                    const candidatesAssetId = `${prefix}_candidates`
                    const state = {
                        kind: 'random',
                        stage: 'candidates',
                        prefix,
                        allocation,
                        thresholds,
                        counts: {},
                        candidateAssetIds: [candidatesAssetId],
                        round: 0,
                        tempAssetIds: [candidatesAssetId]
                    }
                    return this.#exportCandidates$({
                        kind: 'base', assetId: candidatesAssetId, allocation, loThresholds: allocation.map(() => 0), hiThresholds: thresholds
                    }).pipe(
                        map(({eeTaskId}) => ({state, progress: [PROGRESS.prepareCandidates], action: 'export', eeTaskId}))
                    )
                })
            ))
        )
    }

    #startRepair$(state, {loThresholds, hiThresholds, nextThresholds}) {
        const round = state.round + 1
        const repairAssetId = `${state.prefix}_additional_candidates_${round}`
        const repairState = {
            ...state,
            thresholds: nextThresholds,
            candidateAssetIds: [...state.candidateAssetIds, repairAssetId],
            round,
            tempAssetIds: [...state.tempAssetIds, repairAssetId]
        }
        return this.#exportCandidates$({kind: 'repair', assetId: repairAssetId, allocation: state.allocation, loThresholds, hiThresholds}).pipe(
            map(({eeTaskId}) => ({state: repairState, progress: [PROGRESS.checkCandidates, PROGRESS.prepareCandidates], action: 'export', eeTaskId}))
        )
    }

    #startSelected$(state) {
        const {prefix, allocation, candidateAssetIds} = state
        const selectedAssetId = selectedAssetIdOf(prefix)
        const selectedState = {...state, stage: 'selected', tempAssetIds: [...state.tempAssetIds, selectedAssetId]}
        return defer(() => {
            const candidates = candidateAssetIds
                .map(id => ee.FeatureCollection(id))
                .reduce((merged, collection) => merged.merge(collection))
            const collection = selectStratifiedRandomSamples({candidates, allocation, sampleArrangement: this.#sampleArrangement, rowMetadata: this.#toWorkspace()})
                .set(this.#formattedProperties())
            return startTableToAssetExport$({collection, description: this.#taskName('Prepare samples'), assetId: selectedAssetId, strategy: 'create'})
        }).pipe(
            map(({eeTaskId}) => ({state: selectedState, progress: [PROGRESS.checkCandidates, PROGRESS.exportFinal], action: 'export', eeTaskId}))
        )
    }

    // Placement is on the Arrangement CRS; the cell size is the Stratification pixel size. Repair intervals reuse
    // the same seed and grid, so their ranks are disjoint from the earlier candidates'.
    #exportCandidates$({kind, assetId, allocation, loThresholds, hiThresholds}) {
        const {aoi, stratification} = this.#request.recipe.model
        return forkJoin({
            eeStratification: stratificationImage$(stratification, this.#sampleArrangement.stratificationGrid),
            eeGeometry: toGeometry$(aoi)
        }).pipe(
            switchMap(({eeStratification, eeGeometry}) => {
                const collection = sparseRandomCandidates({
                    stratification: eeStratification,
                    region: eeGeometry,
                    grid: this.#grid(),
                    seed: this.#sampleArrangement.seed,
                    loThresholds,
                    hiThresholds,
                    allocation
                })
                const description = this.#taskName(kind === 'repair' ? 'Prepare additional sample candidates' : 'Prepare sample candidates')
                return startTableToAssetExport$({collection, description, assetId, strategy: 'create'})
            })
        )
    }

    #promote$(selectedAssetId) {
        const {assetId, strategy} = this.#request
        return concat(
            ee.createParentFolder$(assetId, 1).pipe(swallow()),
            strategy === 'replace'
                ? ee.deleteAssetRecursive$(assetId, {include: ['ImageCollection', 'Image', 'Table']}).pipe(swallow())
                : EMPTY,
            ee.renameAsset$(selectedAssetId, assetId).pipe(swallow()),
            of(true)
        ).pipe(last())
    }

    #startFinalExport$(collection) {
        const {description, assetId, strategy} = this.#request
        return this.#toWorkspace()
            ? this.#startWorkspaceExport$(collection)
            : startTableToAssetExport$({collection, description, assetId, strategy}).pipe(
                map(({eeTaskId}) => ({action: 'export', eeTaskId}))
            )
    }

    #startWorkspaceExport$(collection) {
        const {description, filenamePrefix, fileFormat} = this.#request
        return startTableToWorkspaceExport$(
            {collection, description, filenamePrefix, fileFormat, selectors: EXPORT_PROPERTY_NAMES},
            {sepalUser: this.#sepalUser}
        ).pipe(
            map(({eeTaskId, destination}) => ({action: 'workspace', eeTaskId, destination}))
        )
    }

    // Unstratified designs carry no stratum area: the AOI area is resolved into the single allocation row.
    #region$() {
        const {aoi, stratification, sampleAllocation: {allocation}} = this.#request.recipe.model
        return toGeometry$(aoi).pipe(
            switchMap(eeGeometry => unstratifiedAllocation$({allocation, stratification, geometry: eeGeometry}).pipe(
                map(resolvedAllocation => ({eeGeometry, allocation: resolvedAllocation}))
            ))
        )
    }

    #grid() {
        const {arrangementGrid, stratificationGrid} = this.#sampleArrangement
        return {crs: arrangementGrid.crs, scale: gridPixelSize(stratificationGrid)}
    }

    #formattedProperties() {
        return formatProperties(this.#request.properties || {})
    }

    // Plain Earth Engine task names for the temporary materialisations, distinct from the final export.
    #taskName(purpose) {
        return sanitizeEarthEngineTaskName(`${purpose}: ${this.#request.description}`)
    }

    #toWorkspace() {
        return this.#request.destination === 'SEPAL'
    }
}

const selectedAssetIdOf = prefix => `${prefix}_selected`

const addCounts = ({counts, added, allocation}) =>
    Object.fromEntries(allocation.map(({stratum}) =>
        [stratum, (Number(counts[stratum]) || 0) + (Number(added[stratum]) || 0)]
    ))
