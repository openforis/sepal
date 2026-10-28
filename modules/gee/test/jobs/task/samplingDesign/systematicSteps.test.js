import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {defer, lastValueFrom, of} from 'rxjs'

import {assertMatches} from '#sepal/testSupport/assert'

// Systematic sampling design driven step by step, as the task container drives it. Earth Engine is substituted:
// exports, candidate counts and the final selection are recorded markers, so each step's decision is visible.

const earthEngine = {}

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            FeatureCollection: source => eeCollection(source),
            Filter: {eq: () => ({}), gte: () => ({})},
            Number: value => value,
            getInfo$: ({summaryOf: {samples, strata}}) => {
                const assetId = samples.source.materialized ?? samples.source
                earthEngine.counts.push({assetId, strata})
                return of(earthEngine.summaries[assetId.endsWith('_additional_candidates') ? 'repair' : 'base'])
            },
            listBuckets$: () => of({assets: [{id: 'projects/alice/assets'}]})
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
        stratificationImage$: () => of('stratification image')
    }
})
mock.module('#sepal/ee/samplingDesign/unstratifiedArea', {
    exports: {
        unstratifiedAllocation$: ({allocation, stratification}) =>
            of(stratification.skip ? allocation.map(row => ({...row, area: AOI_AREA})) : allocation)
    }
})
mock.module('#sepal/ee/samplingDesign/systematicSampling', {
    exports: {
        stratifiedSystematicExactCandidates: ({allocation, densityOffset}) => ({candidates: strataOf(allocation), densityOffset}),
        selectSystematicLevels: ({samples, allocation}) => ({samples, strata: strataOf(allocation)}),
        systematicSelectionSummary: selected => ({summaryOf: selected}),
        stratifiedSystematicFinalSamples: ({candidates, levelsByStratum}) => ({selectedFrom: candidates.source, levelsByStratum})
    }
})
mock.module('#sepal/ee/samplingDesign/unstratifiedSystematicSampling', {
    exports: {
        unstratifiedSystematicIndexCandidates: ({allocation, densityOffset}) => ({candidates: strataOf(allocation), densityOffset}),

        materializeSystematicIndexGeometry: ({candidates, densityOffset}) => {
            earthEngine.materialized.push({source: candidates.source, densityOffset})
            return eeCollection({materialized: candidates.source})
        }
    }
})
mock.module('#sepal/ee/samplingDesign/samples', {
    exports: {
        toDensitySummary: summary => summary,
        systematicStratumMaxOffset: stratum => earthEngine.maxOffsetOf(stratum),

        mergeRepairedCandidates: ({baseSamples, repairSamples, repairedStrata}) =>
            eeCollection({base: baseSamples.source, repair: repairSamples.source, repaired: strataOf(repairedStrata)}),

        finalizeSystematicSamples: ({filteredSamples, densityOffset, rowMetadata}) => ({
            set: properties => ({samples: filteredSamples, densityOffset, rowMetadata, properties})
        })
    }
})
mock.module('#sepal/ee/samplingDesign/validateSampleCounts', {
    exports: {
        getSampleCounts$: () => of(earthEngine.finalCounts)
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

const {SYSTEMATIC_EXPORT_PROPERTY_NAMES} = await import('#sepal/ee/samplingDesign/sampleProperties')
const {SYSTEMATIC_PROGRESS} = await import('#gee/jobs/task/samplingDesign/progress')
const {candidateAssetId, candidateDescription} = await import('#gee/jobs/task/samplingDesign/systematicExportNames')
const {systematicStep$} = await import('#gee/jobs/task/samplingDesign/systematicSteps')

const ALICE = {username: 'alice'}
const ASSET_ID = 'projects/alice/assets/design'
const AOI_AREA = 1e10
const WORKSPACE_DESTINATION = {type: 'drive', folder: 'design_folder'}
const UNDERPRODUCTION = 'tasks.samplingDesign.underproduction.message'
const ALLOCATION = [
    {stratum: 1, label: 'a', sampleSize: 100, area: 1e8, weight: 0.5},
    {stratum: 2, label: 'b', sampleSize: 50, area: 1e8, weight: 0.5}
]

beforeEach(() => {
    earthEngine.assetExports = []
    earthEngine.workspaceExports = []
    earthEngine.counts = []
    earthEngine.materialized = []
    earthEngine.summaries = {base: summary({1: 100, 2: 50})}
    earthEngine.finalCounts = {1: 100, 2: 50}
    earthEngine.maxOffsetOf = () => 5
})

describe('starting a systematic design', () => {
    it('starts the base candidate export under a temporary id recorded for cleanup, answering its task id', async () => {
        const request = assetRequest()

        const first = await step(request, null)

        const baseAssetId = candidateAssetId(first.state.prefix, 'base')
        assert.deepEqual(first, {
            state: {kind: 'systematic', stage: 'base', prefix: first.state.prefix, allocation: ALLOCATION, tempAssetIds: [baseAssetId]},
            progress: [SYSTEMATIC_PROGRESS.prepareBase],
            next: SYSTEMATIC_PROGRESS.checkBase,
            action: 'export',
            eeTaskId: 'asset-export-1'
        })
        assert.match(first.state.prefix, new RegExp(`^${ASSET_ID}_tmp_\\d{17}$`))
        assert.deepEqual(earthEngine.assetExports, [{
            collection: {candidates: [1, 2], densityOffset: 0},
            description: candidateDescription('design', 'base'),
            assetId: baseAssetId,
            strategy: 'create'
        }])
    })

    it('samples an unstratified design over the AOI area, without the raster spacing floor', async () => {
        const request = assetRequest(unstratifiedRecipe({minDistance: 5}))

        const first = await step(request, null)

        assert.equal(first.action, 'export')
        assert.equal(first.state.allocation.length, 1)
        assert.partialDeepStrictEqual(first.state.allocation, [{stratum: 1, area: AOI_AREA}])
        assert.deepEqual(
            earthEngine.assetExports[0].collection,
            {candidates: [1], densityOffset: 0}
        )
    })
})

describe('a gated design starts nothing', () => {
    it('rejects an uncurated Arrangement CRS', async () => {
        const request = assetRequest(stratifiedRecipe({crs: 'EPSG:4326'}))

        const error = await step(request, null).catch(error => error)

        assert.equal(
            error.userMessage.key,
            'tasks.samplingDesign.grid.unsupportedArrangementCrs'
        )
        assert.ok(
            error.userMessage.args.supported.includes('EPSG:6933 - EASE-Grid 2.0 Global')
        )
        assert.deepEqual(earthEngine.assetExports, [])
    })

    it('rejects a stratified minimum distance below two Stratification pixels', async () => {
        const request = assetRequest(stratifiedRecipe({minDistance: 5, scale: 10}))

        const error = await step(request, null).catch(error => error)

        assertMatches(error.userMessage, {
            key: 'tasks.samplingDesign.systematic.grid.minDistanceBelowGrid',
            args: {value: 5, pixelSize: 10, minimum: 20}
        })
        assert.deepEqual(earthEngine.assetExports, [])
    })

    it('holds the raster floor to the Stratification pixel size, not the Arrangement grid', async () => {
        const request = assetRequest(stratifiedRecipe({minDistance: 5, scale: 30, stratificationCrs: 'EPSG:32636'}))

        const error = await step(request, null).catch(error => error)

        assert.deepEqual(error.userMessage.args, {value: 5, pixelSize: 30, minimum: 60})
        assert.deepEqual(earthEngine.assetExports, [])
    })

    it('rejects a blank Stratification CRS', async () => {
        const request = assetRequest(stratifiedRecipe({stratificationCrs: ''}))

        const error = await step(request, null).catch(error => error)

        assert.equal(
            error.userMessage.key,
            'tasks.samplingDesign.grid.invalidStratificationCrs'
        )
        assert.deepEqual(earthEngine.assetExports, [])
    })

    it('accepts a non-curated Stratification CRS alongside a curated Arrangement CRS', async () => {
        const request = assetRequest(stratifiedRecipe({stratificationCrs: 'EPSG:32636'}))

        const first = await step(request, null)

        assert.equal(first.action, 'export')
    })

    it('rejects a design below the minimum-sample contract', async () => {
        const request = assetRequest(stratifiedRecipe({allocation: [{stratum: 1, label: 'snow', sampleSize: 1, area: 1e8, weight: 1}]}))

        const error = await step(request, null).catch(error => error)

        assert.equal(
            error.userMessage.key,
            'tasks.samplingDesign.preflight.belowStatisticalMinimum.samples'
        )
        assert.deepEqual(earthEngine.assetExports, [])
    })
})

describe('after counting the base candidates', () => {
    it('exports the final selection of the base candidates when every stratum is covered', async () => {
        const request = assetRequest()
        const first = await step(request, null)
        const baseAssetId = first.state.tempAssetIds[0]

        const second = await step(request, first.state)

        assertMatches(second, {
            state: {stage: 'final', tempAssetIds: [baseAssetId]},
            progress: [SYSTEMATIC_PROGRESS.exportFinal],
            action: 'export',
            eeTaskId: 'asset-export-2'
        })
        assert.deepEqual(earthEngine.counts, [{assetId: baseAssetId, strata: [1, 2]}])
        assert.partialDeepStrictEqual(earthEngine.assetExports[1].collection, {
            samples: {selectedFrom: baseAssetId, levelsByStratum: {1: 1, 2: 2}},
            densityOffset: 0
        })
    })

    it('repairs only the underproducing strata, from denser candidates', async () => {
        earthEngine.summaries = {base: summary({1: 40, 2: 50}), repair: summary({1: 100})}
        const request = assetRequest()
        const first = await step(request, null)

        const second = await step(request, first.state)

        const repairAssetId = candidateAssetId(first.state.prefix, 'repair')
        assertMatches(second, {
            state: {stage: 'repair', tempAssetIds: [first.state.tempAssetIds[0], repairAssetId]},
            progress: [SYSTEMATIC_PROGRESS.prepareRepair],
            next: SYSTEMATIC_PROGRESS.checkRepair,
            action: 'export',
            eeTaskId: 'asset-export-2'
        })
        const {densityOffset} = earthEngine.assetExports[1].collection
        assert.equal(typeof densityOffset, 'number')
        assert.deepEqual(earthEngine.assetExports[1], {
            collection: {candidates: [1], densityOffset},
            description: candidateDescription('design', 'repair'),
            assetId: repairAssetId,
            strategy: 'create'
        })
        assert.ok(earthEngine.assetExports[1].collection.densityOffset > 0)
    })

    it('fails EXACT/OVER without a repair when even the densest allowed grid underproduces', async () => {
        earthEngine.summaries = {base: summary({1: 40, 2: 50})}
        earthEngine.maxOffsetOf = () => 0
        const request = assetRequest()
        const first = await step(request, null)

        const error = await step(request, first.state).catch(error => error)

        assert.equal(error.userMessage.key, UNDERPRODUCTION)
        assert.deepEqual(
            error.userMessage.args.advice.flatMap(({strata}) => strata),
            [{stratum: 1, label: 'a', actual: 40, requested: 100, kind: 'requestedAllocation'}]
        )
        assert.equal(earthEngine.assetExports.length, 1)
    })

    it('fails EXACT/OVER without a repair when any short stratum is at its minimum-distance limit', async () => {
        earthEngine.summaries = {base: summary({1: 40, 2: 40})}
        earthEngine.maxOffsetOf = ({stratum}) => stratum === 1 ? 0 : 5
        const request = assetRequest()
        const first = await step(request, null)

        const error = await step(request, first.state).catch(error => error)

        assert.equal(error.userMessage.key, UNDERPRODUCTION)
        assert.deepEqual(
            error.userMessage.args.advice.flatMap(({strata}) => strata.map(({stratum}) => stratum)),
            [1]
        )
        assert.equal(earthEngine.assetExports.length, 1)
    })

    it('lets CLOSEST export the base candidates when densifying is not possible', async () => {
        earthEngine.summaries = {base: summary({1: 40, 2: 50})}
        earthEngine.finalCounts = {1: 40, 2: 50}
        earthEngine.maxOffsetOf = () => 0
        const request = assetRequest(stratifiedRecipe({sampleSizeStrategy: 'CLOSEST'}))
        const first = await step(request, null)
        const baseAssetId = first.state.tempAssetIds[0]

        const second = await step(request, first.state)

        assertMatches(second, {
            state: {stage: 'final'},
            progress: [SYSTEMATIC_PROGRESS.exportFinal],
            action: 'export'
        })
        assert.partialDeepStrictEqual(
            earthEngine.assetExports[1].collection,
            {samples: {selectedFrom: baseAssetId}, densityOffset: 0}
        )
    })
})

describe('after counting the repair candidates', () => {
    it('exports the final selection with repaired strata taken from the repair candidates', async () => {
        earthEngine.summaries = {base: summary({1: 40, 2: 50}), repair: summary({1: 100})}
        const request = assetRequest()
        const first = await step(request, null)
        const second = await step(request, first.state)
        const [baseAssetId, repairAssetId] = second.state.tempAssetIds

        const third = await step(request, second.state)

        assertMatches(third, {
            state: {stage: 'final', tempAssetIds: [baseAssetId, repairAssetId]},
            progress: [SYSTEMATIC_PROGRESS.exportFinal],
            action: 'export',
            eeTaskId: 'asset-export-3'
        })
        assert.deepEqual(earthEngine.counts, [
            {assetId: baseAssetId, strata: [1, 2]},
            {assetId: repairAssetId, strata: [1]}
        ])
        assertMatches(earthEngine.assetExports[2].collection, {
            samples: {selectedFrom: {base: baseAssetId, repair: repairAssetId, repaired: [1]}},
            densityOffset: 0
        })
    })

    it('selects repaired strata at their repair levels and the rest at their base levels', async () => {
        earthEngine.summaries = {
            base: summary({1: 40, 2: 50}, {1: 0, 2: 2}),
            repair: summary({1: 100}, {1: 3})
        }
        const request = assetRequest()
        const first = await step(request, null)
        const second = await step(request, first.state)

        await step(request, second.state)

        assert.deepEqual(
            earthEngine.assetExports[2].collection.samples.levelsByStratum,
            {1: 3, 2: 2}
        )
    })

    it('counts and selects unstratified candidates at the density they were generated with', async () => {
        earthEngine.summaries = {base: summary({1: 40}), repair: summary({1: 100})}
        earthEngine.finalCounts = {1: 100}
        const request = assetRequest(unstratifiedRecipe())
        const first = await step(request, null)
        const second = await step(request, first.state)

        await step(request, second.state)

        const [baseAssetId, repairAssetId] = second.state.tempAssetIds
        const repairOffset = earthEngine.assetExports[1].collection.densityOffset
        assert.ok(repairOffset > 0)
        assert.deepEqual(earthEngine.materialized.slice(0, 2), [
            {source: baseAssetId, densityOffset: 0},
            {source: repairAssetId, densityOffset: repairOffset}
        ])
        assert.equal(earthEngine.materialized[2].densityOffset, repairOffset)
        assert.equal(earthEngine.assetExports[2].collection.densityOffset, 0)
    })

    it('fails EXACT/OVER when a repaired stratum is still short', async () => {
        earthEngine.summaries = {base: summary({1: 40, 2: 50}), repair: summary({1: 40})}
        const request = assetRequest()
        const first = await step(request, null)
        const second = await step(request, first.state)

        const error = await step(request, second.state).catch(error => error)

        assert.equal(error.userMessage.key, UNDERPRODUCTION)
        assert.deepEqual(
            error.userMessage.args.advice.flatMap(({strata}) => strata.map(({stratum, actual}) => [stratum, actual])),
            [[1, 40]]
        )
        assert.equal(earthEngine.assetExports.length, 2)
    })
})

describe('the final export', () => {
    it('goes to the user\'s asset with the requested strategy and the recipe properties', async () => {
        const request = assetRequest()
        const first = await step(request, null)

        await step(request, first.state)

        const {collection} = earthEngine.assetExports[1]
        assert.deepEqual(
            {rowMetadata: collection.rowMetadata, properties: collection.properties},
            {rowMetadata: false, properties: {source: 'test', tags: '["a"]'}}
        )
        assert.deepEqual(earthEngine.assetExports[1], {
            collection,
            description: 'design',
            assetId: ASSET_ID,
            strategy: 'replace'
        })
    })

    it('answers a workspace export of the samples for a SEPAL destination', async () => {
        const request = workspaceRequest()
        const first = await step(request, null)

        const second = await step(request, first.state)

        assert.match(
            first.state.prefix,
            /^projects\/alice\/assets\/sampling_design_tmp_\d{17}_[0-9a-f]{6}$/
        )
        const {state} = second
        assert.deepEqual({stage: state.stage, tempAssetIds: state.tempAssetIds}, {stage: 'final', tempAssetIds: first.state.tempAssetIds})
        assert.deepEqual(second, {
            state,
            progress: [SYSTEMATIC_PROGRESS.exportFinal],
            action: 'workspace',
            eeTaskId: 'workspace-export',
            destination: WORKSPACE_DESTINATION
        })
        const [{params: {collection}}] = earthEngine.workspaceExports
        assert.equal(collection.rowMetadata, true)
        assert.deepEqual(earthEngine.workspaceExports, [{
            params: {
                collection,
                description: 'design',
                filenamePrefix: 'samples',
                fileFormat: 'GeoJSON',
                selectors: SYSTEMATIC_EXPORT_PROPERTY_NAMES
            },
            sepalUser: ALICE
        }])
        assert.equal(earthEngine.assetExports.length, 1)
    })

    it('is not started when the final selection is short of the contract', async () => {
        earthEngine.finalCounts = {1: 100, 2: 10}
        const request = assetRequest()
        const first = await step(request, null)

        const error = await step(request, first.state).catch(error => error)

        assert.equal(error.userMessage.key, UNDERPRODUCTION)
        assert.equal(earthEngine.assetExports.length, 1)
    })

    it('leaves nothing to do once it has been started', async () => {
        const request = assetRequest()
        const first = await step(request, null)
        const second = await step(request, first.state)

        const third = await step(request, second.state)

        assert.deepEqual(third, {state: second.state, progress: [], action: 'done'})
        assert.equal(earthEngine.assetExports.length, 2)
    })
})

// State crosses HTTP between steps, so each step sees only what survives JSON.
function step(request, state) {
    return lastValueFrom(systematicStep$({...request, state: JSON.parse(JSON.stringify(state))}, {sepalUser: ALICE}))
}

function assetRequest(recipe = stratifiedRecipe()) {
    return {description: 'design', recipe, properties: {source: 'test', tags: ['a']}, destination: 'ASSET', assetId: ASSET_ID, strategy: 'replace'}
}

function workspaceRequest(recipe = stratifiedRecipe()) {
    return {description: 'design', recipe, properties: {source: 'test'}, destination: 'SEPAL', filenamePrefix: 'samples', fileFormat: 'GeoJSON'}
}

function stratifiedRecipe({allocation = ALLOCATION, sampleSizeStrategy = 'OVER', crs = 'EPSG:6933', stratificationCrs = crs, scale = 10, minDistance = 60} = {}) {
    return {
        model: {
            aoi: {type: 'ASSET', id: 'users/alice/aoi'},
            stratification: {skip: false, scale, crs: stratificationCrs, strata: allocation.map(({stratum, area}) => ({stratum, value: stratum, weight: 1, area}))},
            sampleAllocation: {allocation, minSamplesPerStratum: 2, allocationStrategy: 'PROPORTIONAL'},
            sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy, minDistance, gridOrigin: 'FIXED', seed: 1, crs}
        }
    }
}

function unstratifiedRecipe({minDistance = null} = {}) {
    return {
        model: {
            aoi: {type: 'ASSET', id: 'users/alice/aoi'},
            stratification: {skip: true, scale: 10, crs: 'EPSG:6933', strata: [{stratum: 1, value: 1, weight: 1}]},
            sampleAllocation: {allocation: [{stratum: 1, label: 'All', sampleSize: 100, weight: 1}], minSamplesPerStratum: 2, allocationStrategy: 'PROPORTIONAL'},
            sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', minDistance, gridOrigin: 'FIXED', seed: 1, crs: 'EPSG:6933'}
        }
    }
}

// Candidate counts per stratum; the selected level defaults to the stratum's own number.
function summary(raw, levels = Object.fromEntries(Object.keys(raw).map(stratum => [stratum, Number(stratum)]))) {
    return {raw, actual: raw, levels}
}

function strataOf(allocation) {
    return allocation.map(({stratum}) => stratum)
}

function eeCollection(source) {
    const same = () => eeCollection(source)
    return {source, filter: same, map: same, flatten: same, randomColumn: same, sort: same, limit: same}
}
