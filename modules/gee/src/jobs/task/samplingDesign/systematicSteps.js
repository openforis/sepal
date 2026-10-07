import {defer, forkJoin, map, of, switchMap, throwError} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {effectiveArrangement, resolveArrangementGrids} from '#sepal/ee/samplingDesign/effectiveArrangement'
import {SYSTEMATIC_EXPORT_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {finalizeSystematicSamples, mergeRepairedCandidates, systematicStratumMaxOffset, toDensitySummary} from '#sepal/ee/samplingDesign/samples'
import {stratificationImage$} from '#sepal/ee/samplingDesign/stratificationImage'
import {isStratificationSkipped} from '#sepal/ee/samplingDesign/stratificationSkip'
import {gridPixelSize, unstratifiedMaxDensityOffset} from '#sepal/ee/samplingDesign/systematicLatticeMath'
import {nonRepairableStrata, repairOffset, underproducingStrata} from '#sepal/ee/samplingDesign/systematicRepair'
import {selectSystematicLevels, stratifiedSystematicExactCandidates, stratifiedSystematicFinalSamples, systematicSelectionSummary} from '#sepal/ee/samplingDesign/systematicSampling'
import {unstratifiedAllocation$} from '#sepal/ee/samplingDesign/unstratifiedArea'
import {materializeSystematicIndexGeometry, unstratifiedSystematicIndexCandidates} from '#sepal/ee/samplingDesign/unstratifiedSystematicSampling'
import {getSampleCounts$} from '#sepal/ee/samplingDesign/validateSampleCounts'
import {formatProperties} from '#sepal/formatProperties'
import {effectiveMinSamplesPerStratum} from '#sepal/recipe/samplingDesign/minSamples'

import {startTableToAssetExport$} from '../export/toAsset.js'
import {startTableToWorkspaceExport$} from '../export/toWorkspace.js'
import {finalCountError, gateFinalExport$} from './finalValidationGate.js'
import {SYSTEMATIC_PROGRESS as PROGRESS} from './progress.js'
import {stratifiedGridError, stratifiedMinDistanceError, unstratifiedSystematicGridError} from './samplingGridValidation.js'
import {samplingDesignPreflightError} from './samplingPreflight.js'
import {candidateAssetId, candidateDescription} from './systematicExportNames.js'
import {tempAssetPrefix$} from './tempAssets.js'

// The base density is the area-tuned first guess; the repair densifies only underproducing strata.
const BASE_OFFSET = 0

// One stage of a systematic export: base candidates -> count -> optional single denser repair -> count -> gated
// final export. Candidates are materialised to temporary assets, so every later stage reads them back and only
// plain JSON crosses steps.
export const systematicStep$ = (request, {sepalUser}) => defer(() => {
    const {state, recipe} = request
    if (!state) {
        const gateError = systematicGateError(recipe)
        return gateError
            ? throwError(() => gateError)
            : new SystematicSteps(request, {sepalUser}).start$()
    }
    const steps = new SystematicSteps(request, {sepalUser})
    switch (state.stage) {
        case 'base':
            return steps.afterBase$(state)
        case 'repair':
            return steps.afterRepair$(state)
        case 'final':
            return of({state, progress: [], action: 'done'})
        default:
            return throwError(() => new Error(`Unknown systematic sampling stage: ${state.stage}`))
    }
})

// Pure: what to do after counting the base candidates. Mirrors systematicExportPlan$'s afterBaseCount.
export const afterBaseCount = ({summary, allocation, requireFull, baseOffset, maxOffsetOf}) => {
    const underproducing = underproducingStrata({summary, allocation})
    if (!underproducing.length) {
        return {final: {candidates: {}, levelsByStratum: summary.levels}}
    }
    // A stratum already at its minimum-distance limit stays short whatever the repair, so EXACT/OVER fail now
    // rather than after a repair export that cannot help it.
    if (requireFull) {
        const nonRepairable = nonRepairableStrata({underproducing, baseOffset, maxOffsetOf})
        if (nonRepairable.length) {
            return {fail: {counts: summary.raw, strata: nonRepairable}}
        }
    }
    const offset = repairOffset({underproducing, summary, baseOffset, maxOffsetOf})
    if (offset <= baseOffset) {
        return requireFull
            ? {fail: {counts: summary.raw, strata: underproducing}}
            : {final: {candidates: {}, levelsByStratum: summary.levels}}
    }
    return {repair: {underproducing, offset}}
}

// The structured gates run before any temp asset is named or Earth Engine graph is built. The lattice assumes
// projected metre coordinates and, when stratified, sits on the stratification grid; unstratified spacing is
// analytical, so it has no raster floor.
const systematicGateError = recipe => {
    const unstratified = isStratificationSkipped(recipe.model.stratification)
    const arrangement = effectiveArrangement(recipe.model)
    return (unstratified ? unstratifiedSystematicGridError(arrangement) : stratifiedGridError(arrangement))
        || (unstratified ? null : stratifiedMinDistanceError(arrangement))
        || samplingDesignPreflightError(recipe)
}

class SystematicSteps {
    #request
    #sepalUser
    #unstratified
    #densityStrategy
    #requireFull
    #sampleArrangement
    #validationConfig

    constructor(request, {sepalUser}) {
        const {model} = request.recipe
        const configuredArrangement = effectiveArrangement(model)
        this.#request = request
        this.#sepalUser = sepalUser
        this.#unstratified = isStratificationSkipped(model.stratification)
        this.#densityStrategy = configuredArrangement.sampleSizeStrategy
        // CLOSEST may land below the target; EXACT/OVER must reach the requested count.
        this.#requireFull = this.#densityStrategy !== 'CLOSEST'
        this.#sampleArrangement = resolveArrangementGrids(configuredArrangement)
        // The final-count advice recommends only actions that can help, so it reasons about the submitted spacing
        // and grid.
        this.#validationConfig = {
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: this.#densityStrategy,
            allocationStrategy: model.sampleAllocation?.allocationStrategy,
            estimateSampleSize: !!model.sampleAllocation?.estimateSampleSize,
            manual: model.sampleAllocation?.manual,
            effectiveMinimum: effectiveMinSamplesPerStratum(model.sampleAllocation || {}),
            minDistance: configuredArrangement.minDistance,
            pixelSize: gridPixelSize(configuredArrangement.stratificationGrid),
            unstratified: this.#unstratified
        }
    }

    start$() {
        const {recipe: {model: {stratification, sampleAllocation: {allocation}}}, assetId} = this.#request
        return tempAssetPrefix$({assetId}).pipe(
            switchMap(prefix => this.#eeInputs$().pipe(
                switchMap(eeInputs =>
                    // Unstratified designs carry no stratum area: the AOI area is resolved once and kept in the state.
                    unstratifiedAllocation$({allocation, stratification, geometry: eeInputs.eeGeometry}).pipe(
                        switchMap(resolvedAllocation => {
                            const baseAssetId = candidateAssetId(prefix, 'base')
                            const state = {kind: 'systematic', stage: 'base', prefix, allocation: resolvedAllocation, tempAssetIds: [baseAssetId]}
                            return this.#exportCandidates$(eeInputs, {kind: 'base', assetId: baseAssetId, allocation: resolvedAllocation, densityOffset: BASE_OFFSET}).pipe(
                                map(({eeTaskId}) => ({state, progress: [PROGRESS.prepareBase], action: 'export', eeTaskId}))
                            )
                        })
                    )
                )
            ))
        )
    }

    afterBase$(state) {
        const {prefix, allocation} = state
        return this.#count$({assetId: candidateAssetId(prefix, 'base'), allocation, densityOffset: BASE_OFFSET}).pipe(
            switchMap(summary => {
                const {final, fail, repair} = afterBaseCount({
                    summary, allocation, requireFull: this.#requireFull, baseOffset: BASE_OFFSET, maxOffsetOf: this.#maxOffsetOf
                })
                if (fail) {
                    throw this.#underproductionError(fail)
                }
                return final
                    ? this.#final$(state, [PROGRESS.checkBase], final)
                    : this.#startRepair$(state, summary, repair)
            })
        )
    }

    afterRepair$(state) {
        const {prefix, summary, underproducing, offset} = state
        return this.#count$({assetId: candidateAssetId(prefix, 'repair'), allocation: underproducing, densityOffset: offset}).pipe(
            switchMap(repairSummary => {
                const stillShort = underproducingStrata({summary: repairSummary, allocation: underproducing})
                if (this.#requireFull && stillShort.length) {
                    throw this.#underproductionError({counts: repairSummary.raw, strata: stillShort})
                }
                return this.#final$(state, [PROGRESS.checkRepair], {
                    candidates: {repairedStrata: underproducing},
                    candidateDensityOffset: offset,
                    levelsByStratum: repairedLevels({baseLevels: summary.levels, repairLevels: repairSummary.levels, repairedStrata: underproducing})
                })
            })
        )
    }

    #startRepair$(state, summary, {underproducing, offset}) {
        const repairAssetId = candidateAssetId(state.prefix, 'repair')
        const repairState = {...state, stage: 'repair', summary, underproducing, offset, tempAssetIds: [...state.tempAssetIds, repairAssetId]}
        return this.#eeInputs$().pipe(
            switchMap(eeInputs => this.#exportCandidates$(eeInputs, {kind: 'repair', assetId: repairAssetId, allocation: underproducing, densityOffset: offset})),
            map(({eeTaskId}) => ({state: repairState, progress: [PROGRESS.checkBase, PROGRESS.prepareRepair], action: 'export', eeTaskId}))
        )
    }

    #final$(state, progress, {candidates, candidateDensityOffset = BASE_OFFSET, levelsByStratum}) {
        const {prefix, allocation} = state
        return toGeometry$(this.#request.recipe.model.aoi).pipe(
            switchMap(eeGeometry => {
                const filteredSamples = this.#selectFinalSamples({
                    eeGeometry,
                    candidates: this.#candidatesOf({prefix, ...candidates}),
                    allocation,
                    candidateDensityOffset,
                    levelsByStratum
                })
                // selectedDensityOffset records the base offset; repaired strata may come from a denser asset.
                const samples = finalizeSystematicSamples({
                    filteredSamples, allocation, sampleArrangement: this.#sampleArrangement, densityOffset: BASE_OFFSET, rowMetadata: this.#toWorkspace()
                }).set(formatProperties(this.#request.properties || {}))
                // The selected collection is counted against the minimum-sample contract before the export starts.
                return gateFinalExport$({
                    counts$: getSampleCounts$(filteredSamples, 'systematic final validation count'),
                    allocation,
                    config: this.#validationConfig,
                    export$: this.#startFinalExport$(samples)
                })
            }),
            map(started => ({state: {...state, stage: 'final'}, progress: [...progress, PROGRESS.exportFinal], ...started}))
        )
    }

    #startFinalExport$(collection) {
        const {description, assetId, strategy, filenamePrefix, fileFormat} = this.#request
        return this.#toWorkspace()
            ? startTableToWorkspaceExport$(
                {collection, description, filenamePrefix, fileFormat, selectors: SYSTEMATIC_EXPORT_PROPERTY_NAMES},
                {sepalUser: this.#sepalUser}
            ).pipe(
                map(({eeTaskId, destination}) => ({action: 'workspace', eeTaskId, destination}))
            )
            : startTableToAssetExport$({collection, description, assetId, strategy}).pipe(
                map(({eeTaskId}) => ({action: 'export', eeTaskId}))
            )
    }

    #exportCandidates$({eeStratification, eeGeometry}, {kind, assetId, allocation, densityOffset}) {
        const sampleArrangement = this.#sampleArrangement
        const collection = this.#unstratified
            ? unstratifiedSystematicIndexCandidates({allocation, region: eeGeometry, sampleArrangement, densityOffset})
            : stratifiedSystematicExactCandidates({
                allocation,
                stratification: eeStratification,
                region: eeGeometry,
                stratificationGrid: sampleArrangement.stratificationGrid,
                arrangementGrid: sampleArrangement.arrangementGrid,
                sampleArrangement: {minDistance: sampleArrangement.minDistance, gridOrigin: sampleArrangement.gridOrigin, seed: sampleArrangement.seed},
                densityOffset
            })
        // densityOffset stays out of the user-visible task description and asset id.
        return startTableToAssetExport$({collection, description: candidateDescription(this.#request.description, kind), assetId, strategy: 'create'})
    }

    // Counts read the materialised candidates. Stratified candidates already carry exact geometry, in-AOI membership
    // and their nested level; unstratified ones still materialise their index geometry.
    #count$({assetId, allocation, densityOffset}) {
        return toGeometry$(this.#request.recipe.model.aoi).pipe(
            switchMap(eeGeometry => {
                const candidates = ee.FeatureCollection(assetId)
                const samples = this.#unstratified
                    ? materializeSystematicIndexGeometry({candidates, allocation, region: eeGeometry, sampleArrangement: this.#sampleArrangement, densityOffset})
                    : candidates
                return ee.getInfo$(
                    systematicSelectionSummary(selectSystematicLevels({samples, allocation, strategy: this.#densityStrategy})),
                    'selected-level summary count'
                )
            }),
            map(toDensitySummary)
        )
    }

    #candidatesOf({prefix, repairedStrata}) {
        const baseSamples = ee.FeatureCollection(candidateAssetId(prefix, 'base'))
        return repairedStrata?.length
            ? mergeRepairedCandidates({baseSamples, repairSamples: ee.FeatureCollection(candidateAssetId(prefix, 'repair')), repairedStrata})
            : baseSamples
    }

    // Stratified selection uses the levels the count stages chose; repaired candidates already carry geometry at
    // their repair density.
    #selectFinalSamples({eeGeometry, candidates, allocation, candidateDensityOffset, levelsByStratum}) {
        const {seed} = this.#sampleArrangement
        return this.#unstratified
            ? this.#filterUnstratifiedIndexSamples({region: eeGeometry, candidates, allocation, seed, densityOffset: candidateDensityOffset, levelsByStratum})
            : stratifiedSystematicFinalSamples({candidates, allocation, strategy: this.#densityStrategy, seed, levelsByStratum})
    }

    #filterUnstratifiedIndexSamples({region, candidates, allocation, seed, densityOffset, levelsByStratum}) {
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
            sampleArrangement: this.#sampleArrangement,
            densityOffset
        })
        const selected = this.#densityStrategy === 'EXACT'
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

    #eeInputs$() {
        const {aoi, stratification} = this.#request.recipe.model
        return forkJoin({
            eeStratification: stratificationImage$(stratification, this.#sampleArrangement.stratificationGrid),
            eeGeometry: toGeometry$(aoi)
        })
    }

    // Depends on stratum.area, which the resolved allocation carries for unstratified designs too.
    #maxOffsetOf = stratum => this.#unstratified
        ? unstratifiedMaxDensityOffset({...stratum, minDistance: this.#sampleArrangement.minDistance})
        : systematicStratumMaxOffset(stratum, this.#sampleArrangement)

    // Classified as the final gate would, so an abort before it reports the same reasons and guidance.
    #underproductionError({counts, strata}) {
        return finalCountError({counts, allocation: strata, config: this.#validationConfig})
    }

    #toWorkspace() {
        return this.#request.destination === 'SEPAL'
    }
}

const repairedLevels = ({baseLevels, repairLevels, repairedStrata}) =>
    repairedStrata.reduce(
        (levels, {stratum}) => ({...levels, [String(stratum)]: repairLevels[String(stratum)]}),
        {...baseLevels}
    )
