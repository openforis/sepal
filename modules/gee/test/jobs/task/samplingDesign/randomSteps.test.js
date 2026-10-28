import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {defer, lastValueFrom, of, throwError} from 'rxjs'

import {EASE_GRID_2_GLOBAL_WKT} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {assertMatches} from '#sepal/testSupport/assert'

// Random sampling design driven step by step, as the task container drives it. Earth Engine is substituted:
// exports, candidate inspections, counts and asset operations are recorded, so each step's decision is visible.

const earthEngine = {}

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            FeatureCollection: source => eeCollection(source),
            listBuckets$: () => of({assets: [{id: 'projects/alice/assets'}]}),
            createParentFolder$: (assetId, maxRetries) => assetOperation$('createParentFolder', assetId, maxRetries),
            deleteAssetRecursive$: (assetId, options) => assetOperation$('deleteAssetRecursive', assetId, options),
            renameAsset$: (source, destination) => assetOperation$('renameAsset', source, destination)
        }
    }
})
mock.module('#sepal/ee/aoi', {
    exports: {
        toGeometry$: () => of('aoi geometry')
    }
})
mock.module('#sepal/ee/samplingDesign/stratificationImage', {
    exports: {
        stratificationImage$: (stratification, grid) => defer(() => {
            earthEngine.stratificationGrids.push(grid)
            return of('stratification image')
        })
    }
})
mock.module('#sepal/ee/samplingDesign/unstratifiedArea', {
    exports: {
        unstratifiedAllocation$: ({allocation, stratification}) =>
            of(stratification.skip ? allocation.map(row => ({...row, area: AOI_AREA})) : allocation)
    }
})
mock.module('#sepal/ee/samplingDesign/samples', {
    exports: {
        unstratifiedRandomSamples$: ({allocation, sampleArrangement, rowMetadata}) => defer(() => {
            earthEngine.unstratifiedSamples.push({allocation, sampleArrangement})
            return of({set: properties => ({unstratifiedSamples: strataOf(allocation), rowMetadata, properties})})
        })
    }
})
mock.module('#sepal/ee/samplingDesign/sparseRandomSampling', {
    exports: {
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
    }
})
mock.module('#sepal/ee/samplingDesign/validateSampleCounts', {
    exports: {
        getSampleCounts$: collection => defer(() => {
            earthEngine.calls.push(['getSampleCounts', collection.source])
            return of(earthEngine.finalCounts)
        })
    }
})
mock.module('#gee/jobs/task/export/toAsset', {
    exports: {
        startTableToAssetExport$: params => defer(() => {
            earthEngine.assetExports.push(params)
            return of({eeTaskId: `asset-export-${earthEngine.assetExports.length}`})
        })
    }
})
mock.module('#gee/jobs/task/export/toWorkspace', {
    exports: {
        startTableToWorkspaceExport$: (params, {sepalUser}) => defer(() => {
            earthEngine.workspaceExports.push({params, sepalUser})
            return of({eeTaskId: 'workspace-export', destination: WORKSPACE_DESTINATION})
        })
    }
})

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

        assert.deepEqual(first, {
            state: {kind: 'random', stage: 'final', tempAssetIds: []},
            progress: [RANDOM_PROGRESS.prepareCandidates, RANDOM_PROGRESS.exportFinal],
            action: 'export',
            eeTaskId: 'asset-export-1'
        })
        assert.deepEqual(earthEngine.assetExports, [{
            collection: {unstratifiedSamples: [1], rowMetadata: false, properties: FORMATTED_PROPERTIES},
            description: 'design',
            assetId: ASSET_ID,
            strategy: 'replace'
        }])
        assert.equal(earthEngine.unstratifiedSamples[0].allocation.length, 1)

        assert.partialDeepStrictEqual(
            earthEngine.unstratifiedSamples[0].allocation,
            [{stratum: 1, area: AOI_AREA}]
        )

        assert.deepEqual(earthEngine.inspected, [])
        assert.deepEqual(earthEngine.calls, [])
    })

    it('answers a workspace export of the samples for a SEPAL destination', async () => {
        const request = workspaceRequest(unstratifiedRecipe())

        const first = await step(request, null)

        assert.deepEqual(first, {
            state: {kind: 'random', stage: 'final', tempAssetIds: []},
            progress: [RANDOM_PROGRESS.prepareCandidates, RANDOM_PROGRESS.exportFinal],
            action: 'workspace',
            eeTaskId: 'workspace-export',
            destination: WORKSPACE_DESTINATION
        })
        assert.deepEqual(earthEngine.workspaceExports, [{
            params: {
                collection: {unstratifiedSamples: [1], rowMetadata: true, properties: {source: 'test'}},
                description: 'design',
                filenamePrefix: 'samples',
                fileFormat: 'GeoJSON',
                selectors: EXPORT_PROPERTY_NAMES
            },
            sepalUser: ALICE
        }])
        assert.deepEqual(earthEngine.assetExports, [])
    })

    it('builds no grid at all', async () => {
        const request = assetRequest(unstratifiedRecipe())

        await step(request, null)

        const {sampleArrangement} = earthEngine.unstratifiedSamples[0]
        assert.equal('stratificationGrid' in sampleArrangement, false)
        assert.equal('arrangementGrid' in sampleArrangement, false)
        assert.deepEqual(earthEngine.stratificationGrids, [])
    })

    it('leaves nothing to do once the export has been started', async () => {
        const request = assetRequest(unstratifiedRecipe())
        const first = await step(request, null)

        const second = await step(request, first.state)

        assert.deepEqual(second, {state: first.state, progress: [], action: 'done'})
        assert.equal(earthEngine.assetExports.length, 1)
    })
})

describe('a gated design starts nothing', () => {
    it('rejects a non-curated Arrangement CRS before building any graph', async () => {
        const request = assetRequest(stratifiedRecipe({crs: 'EPSG:32636'}))

        const error = await step(request, null).catch(error => error)

        assert.equal(
            error.userMessage.key,
            'tasks.samplingDesign.grid.unsupportedArrangementCrs'
        )
        assert.deepEqual(earthEngine.stratificationGrids, [])
        assert.deepEqual(earthEngine.assetExports, [])
    })

    it('rejects a blank Stratification CRS before building any graph', async () => {
        const request = assetRequest(stratifiedRecipe({stratificationCrs: ''}))

        const error = await step(request, null).catch(error => error)

        assert.equal(
            error.userMessage.key,
            'tasks.samplingDesign.grid.invalidStratificationCrs'
        )
        assert.deepEqual(earthEngine.stratificationGrids, [])
        assert.deepEqual(earthEngine.assetExports, [])
    })

    it('accepts a non-curated Stratification CRS', async () => {
        const request = assetRequest(stratifiedRecipe({stratificationCrs: 'EPSG:4326'}))

        const first = await step(request, null)

        assert.equal(first.action, 'export')
        assert.equal(earthEngine.assetExports.length, 1)
    })

    it('rejects a design below the minimum-sample contract', async () => {
        const request = assetRequest(stratifiedRecipe({sampleSize: 1}))

        const error = await step(request, null).catch(error => error)

        assert.equal(
            error.userMessage.key,
            'tasks.samplingDesign.preflight.belowStatisticalMinimum.samples'
        )
        assert.deepEqual(earthEngine.stratificationGrids, [])
        assert.deepEqual(earthEngine.assetExports, [])
    })
})

describe('starting a stratified design', () => {
    it('starts the candidate export under a temporary id recorded for cleanup, answering its task id', async () => {
        const request = assetRequest()

        const first = await step(request, null)

        const candidatesId = `${first.state.prefix}_candidates`
        assert.match(first.state.prefix, new RegExp(`^${ASSET_ID}_tmp_\\d{17}$`))
        assert.deepEqual(first, {
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
        assert.ok(first.state.thresholds[0] > 0)
        assert.ok(first.state.thresholds[0] < 1)
        const [{collection: {candidates}}] = earthEngine.assetExports
        assert.deepEqual([candidates.loThresholds, candidates.hiThresholds], [[0], first.state.thresholds])
        assert.deepEqual(earthEngine.assetExports, [{
            collection: {candidates},
            description: 'Prepare_sample_candidates_design',
            assetId: candidatesId,
            strategy: 'create'
        }])
    })

    it('uses a workspace temp prefix for a SEPAL destination', async () => {
        const request = workspaceRequest()

        const first = await step(request, null)

        assert.match(
            first.state.prefix,
            /^projects\/alice\/assets\/sampling_design_tmp_\d{17}_[0-9a-f]{6}$/
        )
    })
})

// The categorical source is interpreted on the Stratification grid while samples are placed on the Arrangement
// grid; each consumer reads its own grid.
describe('two-grid wiring', () => {
    it('interprets the categorical source on the Stratification grid', async () => {
        const request = assetRequest(stratifiedRecipe({crs: 'EPSG:6931', stratificationCrs: 'EPSG:32636'}))

        await step(request, null)

        assert.equal(earthEngine.stratificationGrids.length, 1)

        assert.partialDeepStrictEqual(
            earthEngine.stratificationGrids,
            [{crs: 'EPSG:32636', crsId: 'EPSG:32636', scale: 10}]
        )
    })

    it('resolves EPSG:6933 to WKT for the Stratification grid, since Earth Engine cannot parse the literal', async () => {
        const request = assetRequest(stratifiedRecipe({stratificationCrs: 'EPSG:6933'}))

        await step(request, null)

        assert.partialDeepStrictEqual(
            earthEngine.stratificationGrids[0],
            {crs: EASE_GRID_2_GLOBAL_WKT, crsId: 'EPSG:6933'}
        )
    })

    it('places candidates on the Arrangement CRS at the Stratification pixel size', async () => {
        const request = assetRequest(stratifiedRecipe({crs: 'EPSG:6933', stratificationCrs: 'EPSG:32636'}))

        await step(request, null)

        assert.deepEqual(
            earthEngine.assetExports[0].collection.candidates.grid,
            {crs: EASE_GRID_2_GLOBAL_WKT, scale: 10}
        )
    })

    it('never places candidates on the Stratification CRS', async () => {
        const request = assetRequest(stratifiedRecipe({crs: 'EPSG:6931', stratificationCrs: 'EPSG:32636'}))

        await step(request, null)

        assert.deepEqual(
            earthEngine.assetExports[0].collection.candidates.grid,
            {crs: 'EPSG:6931', scale: 10}
        )
    })
})

describe('after inspecting the candidates', () => {
    it('exports the selection from the candidates to a temporary asset when every stratum is covered', async () => {
        const request = assetRequest()
        const first = await step(request, null)
        const [candidatesId] = first.state.tempAssetIds

        const second = await step(request, first.state)

        const selectedId = `${first.state.prefix}_selected`
        assert.deepEqual(second, {
            state: {...first.state, stage: 'selected', counts: {1: 10}, tempAssetIds: [candidatesId, selectedId]},
            progress: [RANDOM_PROGRESS.exportFinal],
            action: 'export',
            eeTaskId: 'asset-export-2'
        })
        assert.deepEqual(earthEngine.inspected, [candidatesId])
        assert.deepEqual(earthEngine.assetExports[1], {
            collection: {selectedFrom: candidatesId, strata: [1], rowMetadata: false, properties: FORMATTED_PROPERTIES},
            description: 'Prepare_samples_design',
            assetId: selectedId,
            strategy: 'create'
        })
        assert.deepEqual(earthEngine.calls, [])
    })

    it('repairs a short stratum with an additional disjoint interval of denser candidates', async () => {
        earthEngine.candidateCounts = [{1: 4}]
        const request = assetRequest()
        const first = await step(request, null)
        const [candidatesId] = first.state.tempAssetIds
        const [threshold] = first.state.thresholds

        const second = await step(request, first.state)

        const repairId = `${first.state.prefix}_additional_candidates_1`
        assert.deepEqual(second, {
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
        const {collection: {candidates}} = earthEngine.assetExports[1]
        assert.deepEqual([candidates.loThresholds, candidates.hiThresholds], [[threshold], [threshold * 2]])
        assert.deepEqual(earthEngine.assetExports[1], {
            collection: {candidates},
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

        assert.deepEqual(second.state.counts, {1: 4, 2: 20, 3: 7})
        assert.deepEqual(third.state.counts, {1: 7, 2: 25, 3: 7})
        assert.equal(third.state.stage, 'candidates')
        assert.deepEqual(fourth.state.counts, {1: 10, 2: 25, 3: 7})
        assert.equal(fourth.state.stage, 'selected')
        assert.deepEqual(
            earthEngine.assetExports[3].collection.selectedFrom,
            fourth.state.candidateAssetIds
        )
    })

    it('widens only the short strata', async () => {
        earthEngine.candidateCounts = [{1: 4, 2: 20, 3: 7}]
        const request = assetRequest(stratifiedRecipe({allocation: THREE_STRATA}))
        const first = await step(request, null)
        const [t1, t2, t3] = first.state.thresholds

        const second = await step(request, first.state)

        assert.deepEqual(second.state.thresholds, [t1 * 2, t2, t3])
        assertMatches(
            earthEngine.assetExports[1].collection.candidates,
            {loThresholds: [t1, t2, t3], hiThresholds: [t1 * 2, t2, t3]}
        )
    })

    it('fails an underproducing stratified random design with the final-count advice', async () => {
        earthEngine.candidateCounts = [{1: 3}]
        const request = assetRequest(stratifiedRecipe({area: 1}))
        const first = await step(request, null)

        const error = await step(request, first.state).catch(error => error)

        assert.equal(error.userMessage.key, UNDERPRODUCTION)
        assert.deepEqual(
            error.userMessage.args.advice.flatMap(({strata}) => strata.map(({stratum, actual}) => [stratum, actual])),
            [[1, 3]]
        )
        assert.deepEqual(first.state.tempAssetIds, [`${first.state.prefix}_candidates`])
        assert.equal(earthEngine.assetExports.length, 1)
        assert.deepEqual(earthEngine.workspaceExports, [])
        assert.deepEqual(earthEngine.calls, [])
    })

    it('gives up with an internal error once the repair round budget is spent', async () => {
        earthEngine.candidateCounts = []
        const request = assetRequest(stratifiedRecipe({area: 1e30}))
        let state = (await step(request, null)).state
        while (state.round < 40) {
            state = (await step(request, state)).state
        }

        const error = await step(request, state).catch(error => error)

        assert.equal(
            error.message,
            'Sparse random repair did not reach threshold 1 within the round budget'
        )
        assert.equal(error.userMessage, undefined)
        assert.equal(earthEngine.assetExports.length, 41)
    })
})

describe('publishing the selection to the user\'s asset', () => {
    it('validates the ready selected asset, then promotes it by rename instead of re-exporting', async () => {
        const request = assetRequest(stratifiedRecipe(), {strategy: 'create'})
        const second = await stepTo('selected', request)
        const [candidatesId, selectedId] = second.state.tempAssetIds

        const third = await step(request, second.state)

        assert.deepEqual(third, {
            state: {...second.state, stage: 'final', tempAssetIds: [candidatesId]},
            progress: [],
            action: 'done'
        })
        assert.deepEqual(earthEngine.calls, [
            ['getSampleCounts', selectedId],
            ['createParentFolder', ASSET_ID, 1],
            ['renameAsset', selectedId, ASSET_ID]
        ])
        assert.equal(earthEngine.assetExports.length, 2)
    })

    it('deletes an existing asset under replace only after the selection validated', async () => {
        const request = assetRequest(stratifiedRecipe(), {strategy: 'replace'})
        const second = await stepTo('selected', request)
        const selectedId = second.state.tempAssetIds[1]

        await step(request, second.state)

        const [, , [, , {include}]] = earthEngine.calls
        assert.ok(include.includes('Table'))
        assert.deepEqual(earthEngine.calls, [
            ['getSampleCounts', selectedId],
            ['createParentFolder', ASSET_ID, 1],
            ['deleteAssetRecursive', ASSET_ID, {include}],
            ['renameAsset', selectedId, ASSET_ID]
        ])
    })

    it('leaves an existing asset untouched under replace when the validation fails', async () => {
        const request = assetRequest(stratifiedRecipe(), {strategy: 'replace'})
        const second = await stepTo('selected', request)
        earthEngine.finalCounts = {1: 7}

        const error = await step(request, second.state).catch(error => error)

        assert.equal(error.userMessage.key, UNDERPRODUCTION)
        assert.deepEqual(earthEngine.calls, [['getSampleCounts', second.state.tempAssetIds[1]]])
    })

    it('fails with the rename error, leaving the unpromoted selection for cleanup', async () => {
        const request = assetRequest()
        const second = await stepTo('selected', request)
        earthEngine.failRename = new Error('rename failed')

        const error = await step(request, second.state).catch(error => error)

        assert.equal(error.message, 'rename failed')
        assert.deepEqual(
            second.state.tempAssetIds,
            [`${second.state.prefix}_candidates`, `${second.state.prefix}_selected`]
        )
    })

    it('repairs a short candidate export, then validates and publishes the selection', async () => {
        earthEngine.candidateCounts = [{1: 4}, {1: 8}]
        const request = assetRequest(stratifiedRecipe(), {strategy: 'create'})

        const first = await step(request, null)
        const second = await step(request, first.state)
        const third = await step(request, second.state)
        const fourth = await step(request, third.state)

        const {prefix} = first.state
        assert.deepEqual([first, second, third, fourth].map(({progress}) => progress), [
            [RANDOM_PROGRESS.prepareCandidates],
            [RANDOM_PROGRESS.prepareCandidates],
            [RANDOM_PROGRESS.exportFinal],
            []
        ])
        assert.deepEqual([first, second, third, fourth].map(({next}) => next), [
            RANDOM_PROGRESS.checkCandidates,
            RANDOM_PROGRESS.checkCandidates,
            undefined,
            undefined
        ])
        assert.deepEqual(
            earthEngine.assetExports.map(({assetId}) => assetId),
            [`${prefix}_candidates`, `${prefix}_additional_candidates_1`, `${prefix}_selected`]
        )
        assert.deepEqual(
            earthEngine.inspected,
            [`${prefix}_candidates`, `${prefix}_additional_candidates_1`]
        )
        assert.deepEqual(
            earthEngine.assetExports[2].collection.selectedFrom,
            [`${prefix}_candidates`, `${prefix}_additional_candidates_1`]
        )
        assert.deepEqual(earthEngine.calls, [
            ['getSampleCounts', `${prefix}_selected`],
            ['createParentFolder', ASSET_ID, 1],
            ['renameAsset', `${prefix}_selected`, ASSET_ID]
        ])
        assertMatches(
            fourth,
            {state: {tempAssetIds: [`${prefix}_candidates`, `${prefix}_additional_candidates_1`]}, action: 'done'}
        )
    })
})

describe('publishing the selection to the workspace', () => {
    it('exports from the validated selected asset, keeping every temporary asset for cleanup', async () => {
        const request = workspaceRequest()
        const second = await stepTo('selected', request)
        const selectedId = `${second.state.prefix}_selected`

        const third = await step(request, second.state)

        assert.equal(earthEngine.assetExports[1].collection.rowMetadata, true)
        assert.deepEqual(third, {
            state: {...second.state, stage: 'final'},
            progress: [],
            action: 'workspace',
            eeTaskId: 'workspace-export',
            destination: WORKSPACE_DESTINATION
        })
        assert.deepEqual(
            third.state.tempAssetIds,
            [`${second.state.prefix}_candidates`, selectedId]
        )
        const [{params: {collection}}] = earthEngine.workspaceExports
        assert.equal(collection.source, selectedId)
        assert.deepEqual(earthEngine.workspaceExports, [{
            params: {
                collection,
                description: 'design',
                filenamePrefix: 'samples',
                fileFormat: 'GeoJSON',
                selectors: EXPORT_PROPERTY_NAMES
            },
            sepalUser: ALICE
        }])
        assert.deepEqual(earthEngine.calls, [['getSampleCounts', selectedId]])
    })

    it('leaves nothing to do once the workspace export has been started', async () => {
        const request = workspaceRequest()
        const second = await stepTo('selected', request)
        const third = await step(request, second.state)

        const fourth = await step(request, third.state)

        assert.deepEqual(fourth, {state: third.state, progress: [], action: 'done'})
        assert.equal(earthEngine.workspaceExports.length, 1)
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
