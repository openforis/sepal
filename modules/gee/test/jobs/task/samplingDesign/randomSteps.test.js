import {jest} from '@jest/globals'
import {defer, lastValueFrom, of, throwError} from 'rxjs'

import {EASE_GRID_2_GLOBAL_WKT} from '#sepal/recipe/samplingDesign/samplingGridCrs'

// Random sampling design driven step by step, as the task container drives it. Earth Engine is substituted:
// exports, candidate inspections, counts and asset operations are recorded, so each step's decision is visible.

const earthEngine = {}

jest.unstable_mockModule('#sepal/ee/ee', () => ({
    default: {
        FeatureCollection: source => eeCollection(source),
        listBuckets$: () => of({assets: [{id: 'projects/alice/assets'}]}),
        createParentFolder$: (assetId, maxRetries) => assetOperation$('createParentFolder', assetId, maxRetries),
        deleteAssetRecursive$: (assetId, options) => assetOperation$('deleteAssetRecursive', assetId, options),
        renameAsset$: (source, destination) => assetOperation$('renameAsset', source, destination)
    }
}))
jest.unstable_mockModule('#sepal/ee/aoi', () => ({
    toGeometry$: () => of('aoi geometry')
}))
jest.unstable_mockModule('#sepal/ee/samplingDesign/stratificationImage', () => ({
    stratificationImage$: (stratification, grid) => defer(() => {
        earthEngine.stratificationGrids.push(grid)
        return of('stratification image')
    })
}))
jest.unstable_mockModule('#sepal/ee/samplingDesign/unstratifiedArea', () => ({
    unstratifiedAllocation$: ({allocation, stratification}) =>
        of(stratification.skip ? allocation.map(row => ({...row, area: AOI_AREA})) : allocation)
}))
jest.unstable_mockModule('#sepal/ee/samplingDesign/samples', () => ({
    unstratifiedRandomSamples$: ({allocation, sampleArrangement, rowMetadata}) => defer(() => {
        earthEngine.unstratifiedSamples.push({allocation, sampleArrangement})
        return of({set: properties => ({unstratifiedSamples: strataOf(allocation), rowMetadata, properties})})
    })
}))
jest.unstable_mockModule('#sepal/ee/samplingDesign/sparseRandomSampling', () => ({
    sparseRandomCandidates: ({stratification, region, grid, seed, loThresholds, hiThresholds}) =>
        ({candidates: {stratification, region, grid, seed, loThresholds, hiThresholds}}),
    inspectCandidates$: collection => defer(() => {
        earthEngine.inspected.push(collection.source)
        const countsByStratum = earthEngine.candidateCounts.shift() ?? {}
        return of({countsByStratum, size: Object.values(countsByStratum).reduce((sum, count) => sum + count, 0)})
    }),
    selectStratifiedRandomSamples: ({candidates, allocation, rowMetadata}) => ({
        set: properties => ({selectedFrom: candidates.source, strata: strataOf(allocation), rowMetadata, properties})
    })
}))
jest.unstable_mockModule('#sepal/ee/samplingDesign/validateSampleCounts', () => ({
    getSampleCounts$: collection => defer(() => {
        earthEngine.calls.push(['getSampleCounts', collection.source])
        return of(earthEngine.finalCounts)
    })
}))
jest.unstable_mockModule('#gee/jobs/task/export/toAsset', () => ({
    startTableToAssetExport$: params => defer(() => {
        earthEngine.assetExports.push(params)
        return of({eeTaskId: `asset-export-${earthEngine.assetExports.length}`})
    })
}))
jest.unstable_mockModule('#gee/jobs/task/export/toWorkspace', () => ({
    startTableToWorkspaceExport$: (params, {sepalUser}) => defer(() => {
        earthEngine.workspaceExports.push({params, sepalUser})
        return of({eeTaskId: 'workspace-export', destination: WORKSPACE_DESTINATION})
    })
}))

const {EXPORT_PROPERTY_NAMES} = await import('#sepal/ee/samplingDesign/sampleProperties')
const {RANDOM_PROGRESS} = await import('#gee/jobs/task/samplingDesign/progress')
const {randomStep$} = await import('#gee/jobs/task/samplingDesign/randomSteps')

const ALICE = {username: 'alice'}
const ASSET_ID = 'projects/alice/assets/design'
const AOI_AREA = 1e10
const WORKSPACE_DESTINATION = {type: 'drive', folder: 'design_folder'}
const UNDERPRODUCTION = 'tasks.samplingDesign.underproduction.message'
const PROPERTIES = {source: 'test', tags: ['a']}
const FORMATTED_PROPERTIES = {source: 'test', tags: '["a"]'}

beforeEach(() => {
    earthEngine.assetExports = []
    earthEngine.workspaceExports = []
    earthEngine.unstratifiedSamples = []
    earthEngine.stratificationGrids = []
    earthEngine.inspected = []
    earthEngine.calls = []
    earthEngine.candidateCounts = [{1: 10}]
    earthEngine.finalCounts = {1: 10}
    earthEngine.failRename = null
})

describe('an unstratified design', () => {
    it('exports the exact-count samples straight to the user\'s asset, with no temp asset and no count', async () => {
        const request = assetRequest(unstratifiedRecipe())

        const first = await step(request, null)

        expect(first).toEqual({
            state: {kind: 'random', stage: 'final', tempAssetIds: []},
            progress: [RANDOM_PROGRESS.prepareCandidates, RANDOM_PROGRESS.exportFinal],
            action: 'export',
            eeTaskId: 'asset-export-1'
        })
        expect(earthEngine.assetExports).toEqual([{
            collection: {unstratifiedSamples: [1], rowMetadata: false, properties: FORMATTED_PROPERTIES},
            description: 'design',
            assetId: ASSET_ID,
            strategy: 'replace'
        }])
        expect(earthEngine.unstratifiedSamples[0].allocation).toEqual([expect.objectContaining({stratum: 1, area: AOI_AREA})])
        expect(earthEngine.inspected).toEqual([])
        expect(earthEngine.calls).toEqual([])
    })

    it('answers a workspace export of the samples for a SEPAL destination', async () => {
        const request = workspaceRequest(unstratifiedRecipe())

        const first = await step(request, null)

        expect(first).toEqual({
            state: {kind: 'random', stage: 'final', tempAssetIds: []},
            progress: [RANDOM_PROGRESS.prepareCandidates, RANDOM_PROGRESS.exportFinal],
            action: 'workspace',
            eeTaskId: 'workspace-export',
            destination: WORKSPACE_DESTINATION
        })
        expect(earthEngine.workspaceExports).toEqual([{
            params: {
                collection: {unstratifiedSamples: [1], rowMetadata: true, properties: {source: 'test'}},
                description: 'design',
                filenamePrefix: 'samples',
                fileFormat: 'GeoJSON',
                selectors: EXPORT_PROPERTY_NAMES
            },
            sepalUser: ALICE
        }])
        expect(earthEngine.assetExports).toEqual([])
    })

    it('builds no grid at all', async () => {
        const request = assetRequest(unstratifiedRecipe())

        await step(request, null)

        const {sampleArrangement} = earthEngine.unstratifiedSamples[0]
        expect('stratificationGrid' in sampleArrangement).toBe(false)
        expect('arrangementGrid' in sampleArrangement).toBe(false)
        expect(earthEngine.stratificationGrids).toEqual([])
    })

    it('leaves nothing to do once the export has been started', async () => {
        const request = assetRequest(unstratifiedRecipe())
        const first = await step(request, null)

        const second = await step(request, first.state)

        expect(second).toEqual({state: first.state, progress: [], action: 'done'})
        expect(earthEngine.assetExports).toHaveLength(1)
    })
})

describe('a gated design starts nothing', () => {
    it('rejects a non-curated Arrangement CRS before building any graph', async () => {
        const request = assetRequest(stratifiedRecipe({crs: 'EPSG:32636'}))

        const error = await step(request, null).catch(error => error)

        expect(error.userMessage.key).toBe('tasks.samplingDesign.grid.unsupportedArrangementCrs')
        expect(earthEngine.stratificationGrids).toEqual([])
        expect(earthEngine.assetExports).toEqual([])
    })

    it('rejects a blank Stratification CRS before building any graph', async () => {
        const request = assetRequest(stratifiedRecipe({stratificationCrs: ''}))

        const error = await step(request, null).catch(error => error)

        expect(error.userMessage.key).toBe('tasks.samplingDesign.grid.invalidStratificationCrs')
        expect(earthEngine.stratificationGrids).toEqual([])
        expect(earthEngine.assetExports).toEqual([])
    })

    it('accepts a non-curated Stratification CRS', async () => {
        const request = assetRequest(stratifiedRecipe({stratificationCrs: 'EPSG:4326'}))

        const first = await step(request, null)

        expect(first.action).toBe('export')
        expect(earthEngine.assetExports).toHaveLength(1)
    })

    it('rejects a design below the minimum-sample contract', async () => {
        const request = assetRequest(stratifiedRecipe({sampleSize: 1}))

        const error = await step(request, null).catch(error => error)

        expect(error.userMessage.key).toBe('tasks.samplingDesign.preflight.belowStatisticalMinimum.samples')
        expect(earthEngine.stratificationGrids).toEqual([])
        expect(earthEngine.assetExports).toEqual([])
    })
})

describe('starting a stratified design', () => {
    it('starts the candidate export under a temporary id recorded for cleanup, answering its task id', async () => {
        const request = assetRequest()

        const first = await step(request, null)

        const candidatesId = `${first.state.prefix}_candidates`
        expect(first.state.prefix).toMatch(new RegExp(`^${ASSET_ID}_tmp_\\d{17}$`))
        expect(first).toEqual({
            state: {
                kind: 'random',
                stage: 'candidates',
                prefix: first.state.prefix,
                allocation: ALLOCATION,
                thresholds: [first.state.thresholds[0]],
                counts: {},
                candidateAssetIds: [candidatesId],
                round: 0,
                tempAssetIds: [candidatesId]
            },
            progress: [RANDOM_PROGRESS.prepareCandidates],
            next: RANDOM_PROGRESS.checkCandidates,
            action: 'export',
            eeTaskId: 'asset-export-1'
        })
        expect(first.state.thresholds[0]).toBeGreaterThan(0)
        expect(first.state.thresholds[0]).toBeLessThan(1)
        expect(earthEngine.assetExports).toEqual([{
            collection: {candidates: expect.objectContaining({loThresholds: [0], hiThresholds: first.state.thresholds})},
            description: 'Prepare_sample_candidates_design',
            assetId: candidatesId,
            strategy: 'create'
        }])
    })

    it('uses a workspace temp prefix for a SEPAL destination', async () => {
        const request = workspaceRequest()

        const first = await step(request, null)

        expect(first.state.prefix).toMatch(/^projects\/alice\/assets\/sampling_design_tmp_\d{17}_[0-9a-f]{6}$/)
    })
})

// The categorical source is interpreted on the Stratification grid while samples are placed on the Arrangement
// grid; each consumer reads its own grid.
describe('two-grid wiring', () => {
    it('interprets the categorical source on the Stratification grid', async () => {
        const request = assetRequest(stratifiedRecipe({crs: 'EPSG:6931', stratificationCrs: 'EPSG:32636'}))

        await step(request, null)

        expect(earthEngine.stratificationGrids).toEqual([expect.objectContaining({crs: 'EPSG:32636', crsId: 'EPSG:32636', scale: 10})])
    })

    it('resolves EPSG:6933 to WKT for the Stratification grid, since Earth Engine cannot parse the literal', async () => {
        const request = assetRequest(stratifiedRecipe({stratificationCrs: 'EPSG:6933'}))

        await step(request, null)

        expect(earthEngine.stratificationGrids[0]).toMatchObject({crs: EASE_GRID_2_GLOBAL_WKT, crsId: 'EPSG:6933'})
    })

    it('places candidates on the Arrangement CRS at the Stratification pixel size', async () => {
        const request = assetRequest(stratifiedRecipe({crs: 'EPSG:6933', stratificationCrs: 'EPSG:32636'}))

        await step(request, null)

        expect(earthEngine.assetExports[0].collection.candidates.grid).toEqual({crs: EASE_GRID_2_GLOBAL_WKT, scale: 10})
    })

    it('never places candidates on the Stratification CRS', async () => {
        const request = assetRequest(stratifiedRecipe({crs: 'EPSG:6931', stratificationCrs: 'EPSG:32636'}))

        await step(request, null)

        expect(earthEngine.assetExports[0].collection.candidates.grid).toEqual({crs: 'EPSG:6931', scale: 10})
    })
})

describe('after inspecting the candidates', () => {
    it('exports the selection from the candidates to a temporary asset when every stratum is covered', async () => {
        const request = assetRequest()
        const first = await step(request, null)
        const [candidatesId] = first.state.tempAssetIds

        const second = await step(request, first.state)

        const selectedId = `${first.state.prefix}_selected`
        expect(second).toEqual({
            state: {...first.state, stage: 'selected', counts: {1: 10}, tempAssetIds: [candidatesId, selectedId]},
            progress: [RANDOM_PROGRESS.exportFinal],
            action: 'export',
            eeTaskId: 'asset-export-2'
        })
        expect(earthEngine.inspected).toEqual([candidatesId])
        expect(earthEngine.assetExports[1]).toEqual({
            collection: {selectedFrom: candidatesId, strata: [1], rowMetadata: false, properties: FORMATTED_PROPERTIES},
            description: 'Prepare_samples_design',
            assetId: selectedId,
            strategy: 'create'
        })
        expect(earthEngine.calls).toEqual([])
    })

    it('repairs a short stratum with an additional disjoint interval of denser candidates', async () => {
        earthEngine.candidateCounts = [{1: 4}]
        const request = assetRequest()
        const first = await step(request, null)
        const [candidatesId] = first.state.tempAssetIds
        const [threshold] = first.state.thresholds

        const second = await step(request, first.state)

        const repairId = `${first.state.prefix}_additional_candidates_1`
        expect(second).toEqual({
            state: {
                ...first.state,
                thresholds: [threshold * 2],
                counts: {1: 4},
                candidateAssetIds: [candidatesId, repairId],
                round: 1,
                tempAssetIds: [candidatesId, repairId]
            },
            progress: [RANDOM_PROGRESS.prepareCandidates],
            next: RANDOM_PROGRESS.checkCandidates,
            action: 'export',
            eeTaskId: 'asset-export-2'
        })
        expect(earthEngine.assetExports[1]).toEqual({
            collection: {candidates: expect.objectContaining({loThresholds: [threshold], hiThresholds: [threshold * 2]})},
            description: 'Prepare_additional_sample_candidates_design',
            assetId: repairId,
            strategy: 'create'
        })
    })

    it('adds each repair\'s candidates to the counts so far, stratum by stratum', async () => {
        earthEngine.candidateCounts = [{1: 4, 2: 20, 3: 7}, {1: 3, 2: 5}, {1: 3}]
        const request = assetRequest(stratifiedRecipe({allocation: THREE_STRATA}))
        const first = await step(request, null)
        const second = await step(request, first.state)

        const third = await step(request, second.state)
        const fourth = await step(request, third.state)

        expect(second.state.counts).toEqual({1: 4, 2: 20, 3: 7})
        expect(third.state.counts).toEqual({1: 7, 2: 25, 3: 7})
        expect(third.state.stage).toBe('candidates')
        expect(fourth.state.counts).toEqual({1: 10, 2: 25, 3: 7})
        expect(fourth.state.stage).toBe('selected')
        expect(earthEngine.assetExports[3].collection.selectedFrom).toEqual(fourth.state.candidateAssetIds)
    })

    it('widens only the short strata', async () => {
        earthEngine.candidateCounts = [{1: 4, 2: 20, 3: 7}]
        const request = assetRequest(stratifiedRecipe({allocation: THREE_STRATA}))
        const first = await step(request, null)
        const [t1, t2, t3] = first.state.thresholds

        const second = await step(request, first.state)

        expect(second.state.thresholds).toEqual([t1 * 2, t2, t3])
        expect(earthEngine.assetExports[1].collection.candidates).toMatchObject({loThresholds: [t1, t2, t3], hiThresholds: [t1 * 2, t2, t3]})
    })

    it('fails an underproducing stratified random design with the final-count advice', async () => {
        earthEngine.candidateCounts = [{1: 3}]
        const request = assetRequest(stratifiedRecipe({area: 1}))
        const first = await step(request, null)

        const error = await step(request, first.state).catch(error => error)

        expect(error.userMessage.key).toBe(UNDERPRODUCTION)
        expect(error.userMessage.args.advice.flatMap(({strata}) => strata.map(({stratum, actual}) => [stratum, actual])))
            .toEqual([[1, 3]])
        expect(first.state.tempAssetIds).toEqual([`${first.state.prefix}_candidates`])
        expect(earthEngine.assetExports).toHaveLength(1)
        expect(earthEngine.workspaceExports).toEqual([])
        expect(earthEngine.calls).toEqual([])
    })

    it('gives up with an internal error once the repair round budget is spent', async () => {
        earthEngine.candidateCounts = []
        const request = assetRequest(stratifiedRecipe({area: 1e30}))
        let state = (await step(request, null)).state
        while (state.round < 40) {
            state = (await step(request, state)).state
        }

        const error = await step(request, state).catch(error => error)

        expect(error.message).toBe('Sparse random repair did not reach threshold 1 within the round budget')
        expect(error.userMessage).toBeUndefined()
        expect(earthEngine.assetExports).toHaveLength(41)
    })
})

describe('publishing the selection to the user\'s asset', () => {
    it('validates the ready selected asset, then promotes it by rename instead of re-exporting', async () => {
        const request = assetRequest(stratifiedRecipe(), {strategy: 'create'})
        const second = await stepTo('selected', request)
        const [candidatesId, selectedId] = second.state.tempAssetIds

        const third = await step(request, second.state)

        expect(third).toEqual({
            state: {...second.state, stage: 'final', tempAssetIds: [candidatesId]},
            progress: [],
            action: 'done'
        })
        expect(earthEngine.calls).toEqual([
            ['getSampleCounts', selectedId],
            ['createParentFolder', ASSET_ID, 1],
            ['renameAsset', selectedId, ASSET_ID]
        ])
        expect(earthEngine.assetExports).toHaveLength(2)
    })

    it('deletes an existing asset under replace only after the selection validated', async () => {
        const request = assetRequest(stratifiedRecipe(), {strategy: 'replace'})
        const second = await stepTo('selected', request)
        const selectedId = second.state.tempAssetIds[1]

        await step(request, second.state)

        expect(earthEngine.calls).toEqual([
            ['getSampleCounts', selectedId],
            ['createParentFolder', ASSET_ID, 1],
            ['deleteAssetRecursive', ASSET_ID, {include: expect.arrayContaining(['Table'])}],
            ['renameAsset', selectedId, ASSET_ID]
        ])
    })

    it('leaves an existing asset untouched under replace when the validation fails', async () => {
        const request = assetRequest(stratifiedRecipe(), {strategy: 'replace'})
        const second = await stepTo('selected', request)
        earthEngine.finalCounts = {1: 7}

        const error = await step(request, second.state).catch(error => error)

        expect(error.userMessage.key).toBe(UNDERPRODUCTION)
        expect(earthEngine.calls).toEqual([['getSampleCounts', second.state.tempAssetIds[1]]])
    })

    it('fails with the rename error, leaving the unpromoted selection for cleanup', async () => {
        const request = assetRequest()
        const second = await stepTo('selected', request)
        earthEngine.failRename = new Error('rename failed')

        const error = await step(request, second.state).catch(error => error)

        expect(error.message).toBe('rename failed')
        expect(second.state.tempAssetIds).toEqual([`${second.state.prefix}_candidates`, `${second.state.prefix}_selected`])
    })

    it('repairs a short candidate export, then validates and publishes the selection', async () => {
        earthEngine.candidateCounts = [{1: 4}, {1: 8}]
        const request = assetRequest(stratifiedRecipe(), {strategy: 'create'})

        const first = await step(request, null)
        const second = await step(request, first.state)
        const third = await step(request, second.state)
        const fourth = await step(request, third.state)

        const {prefix} = first.state
        expect([first, second, third, fourth].map(({progress}) => progress)).toEqual([
            [RANDOM_PROGRESS.prepareCandidates],
            [RANDOM_PROGRESS.prepareCandidates],
            [RANDOM_PROGRESS.exportFinal],
            []
        ])
        expect([first, second, third, fourth].map(({next}) => next)).toEqual([
            RANDOM_PROGRESS.checkCandidates,
            RANDOM_PROGRESS.checkCandidates,
            undefined,
            undefined
        ])
        expect(earthEngine.assetExports.map(({assetId}) => assetId))
            .toEqual([`${prefix}_candidates`, `${prefix}_additional_candidates_1`, `${prefix}_selected`])
        expect(earthEngine.inspected).toEqual([`${prefix}_candidates`, `${prefix}_additional_candidates_1`])
        expect(earthEngine.assetExports[2].collection.selectedFrom).toEqual([`${prefix}_candidates`, `${prefix}_additional_candidates_1`])
        expect(earthEngine.calls).toEqual([
            ['getSampleCounts', `${prefix}_selected`],
            ['createParentFolder', ASSET_ID, 1],
            ['renameAsset', `${prefix}_selected`, ASSET_ID]
        ])
        expect(fourth).toMatchObject({state: {tempAssetIds: [`${prefix}_candidates`, `${prefix}_additional_candidates_1`]}, action: 'done'})
    })
})

describe('publishing the selection to the workspace', () => {
    it('exports from the validated selected asset, keeping every temporary asset for cleanup', async () => {
        const request = workspaceRequest()
        const second = await stepTo('selected', request)
        const selectedId = `${second.state.prefix}_selected`

        const third = await step(request, second.state)

        expect(earthEngine.assetExports[1].collection.rowMetadata).toBe(true)
        expect(third).toEqual({
            state: {...second.state, stage: 'final'},
            progress: [],
            action: 'workspace',
            eeTaskId: 'workspace-export',
            destination: WORKSPACE_DESTINATION
        })
        expect(third.state.tempAssetIds).toEqual([`${second.state.prefix}_candidates`, selectedId])
        expect(earthEngine.workspaceExports).toEqual([{
            params: {
                collection: expect.objectContaining({source: selectedId}),
                description: 'design',
                filenamePrefix: 'samples',
                fileFormat: 'GeoJSON',
                selectors: EXPORT_PROPERTY_NAMES
            },
            sepalUser: ALICE
        }])
        expect(earthEngine.calls).toEqual([['getSampleCounts', selectedId]])
    })

    it('leaves nothing to do once the workspace export has been started', async () => {
        const request = workspaceRequest()
        const second = await stepTo('selected', request)
        const third = await step(request, second.state)

        const fourth = await step(request, third.state)

        expect(fourth).toEqual({state: third.state, progress: [], action: 'done'})
        expect(earthEngine.workspaceExports).toHaveLength(1)
    })
})

const ALLOCATION = [{stratum: 1, label: 'a', area: 1e6, sampleSize: 10, weight: 1}]
const THREE_STRATA = [
    {stratum: 1, label: 'a', area: 1e6, sampleSize: 10, weight: 0.4},
    {stratum: 2, label: 'b', area: 1e6, sampleSize: 10, weight: 0.3},
    {stratum: 3, label: 'c', area: 1e6, sampleSize: 5, weight: 0.3}
]

// State crosses HTTP between steps, so each step sees only what survives JSON.
function step(request, state) {
    return lastValueFrom(randomStep$({...request, state: JSON.parse(JSON.stringify(state))}, {sepalUser: ALICE}))
}

async function stepTo(stage, request) {
    let result = await step(request, null)
    while (result.state.stage !== stage) {
        result = await step(request, result.state)
    }
    return result
}

function assetRequest(recipe = stratifiedRecipe(), {strategy = 'replace'} = {}) {
    return {description: 'design', recipe, properties: PROPERTIES, destination: 'ASSET', assetId: ASSET_ID, strategy}
}

function workspaceRequest(recipe = stratifiedRecipe()) {
    return {description: 'design', recipe, properties: {source: 'test'}, destination: 'SEPAL', filenamePrefix: 'samples', fileFormat: 'GeoJSON'}
}

// The area is large by default, so the first threshold is well below 1 and a short count is repairable.
function stratifiedRecipe({crs = 'EPSG:6933', stratificationCrs = crs, area, sampleSize, allocation = withOverrides({area, sampleSize})} = {}) {
    return {
        model: {
            aoi: {type: 'ASSET', id: 'users/alice/aoi'},
            stratification: {skip: false, scale: 10, crs: stratificationCrs, strata: allocation.map(({stratum, area}) => ({stratum, value: stratum, weight: 1, area}))},
            sampleAllocation: {allocation, minSamplesPerStratum: 2, allocationStrategy: 'PROPORTIONAL'},
            sampleArrangement: {arrangementStrategy: 'RANDOM', seed: 1, crs}
        }
    }
}

function unstratifiedRecipe() {
    return {
        model: {
            aoi: {type: 'ASSET', id: 'users/alice/aoi'},
            stratification: {skip: [true], scale: 10, crs: 'EPSG:6933', strata: [{stratum: 1, value: 1, weight: 1}]},
            sampleAllocation: {allocation: [{stratum: 1, label: 'All', sampleSize: 10, weight: 1}], minSamplesPerStratum: 2, allocationStrategy: 'PROPORTIONAL'},
            sampleArrangement: {arrangementStrategy: 'RANDOM', seed: 1, crs: 'EPSG:6933'}
        }
    }
}

function withOverrides(overrides) {
    const defined = Object.fromEntries(Object.entries(overrides).filter(([_key, value]) => value !== undefined))
    return ALLOCATION.map(row => ({...row, ...defined}))
}

function assetOperation$(operation, ...args) {
    return defer(() => {
        earthEngine.calls.push([operation, ...args])
        return operation === 'renameAsset' && earthEngine.failRename
            ? throwError(() => earthEngine.failRename)
            : of(undefined)
    })
}

function strataOf(allocation) {
    return allocation.map(({stratum}) => stratum)
}

function eeCollection(source) {
    return {source, merge: other => eeCollection([source, other.source].flat())}
}
