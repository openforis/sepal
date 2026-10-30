import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {defer, lastValueFrom, of} from 'rxjs'

// Whether a sampling task samples the design its areas and automatic proportions were calculated for, judged at every
// stage from what that stage's own request reads. The recipe service, asset metadata and Earth Engine are substituted;
// the stages, the gate, the evidence producer and the comparison are production's.

const earthEngine = {}
const assets = {}

mock.module('#gee/jobs/ee/asset/versions', {
    exports: {
        assetVersions$: ids => defer(() => of(ids.map(id => ({id, ...assets[id]}))))
    }
})
mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            FeatureCollection: source => collection(source),
            Filter: {eq: () => ({}), gte: () => ({})},
            Number: value => value,
            getInfo$: () => of({raw: {1: 100}, actual: {1: 100}, levels: {1: 1}}),
            listBuckets$: () => of({assets: [{id: 'projects/alice/assets'}]})
        }
    }
})
mock.module('#sepal/ee/aoi', {exports: {toGeometry$: () => of('aoi geometry')}})
mock.module('#sepal/ee/samplingDesign/stratificationImage', {exports: {stratificationImage$: () => of('stratification image')}})
mock.module('#sepal/ee/samplingDesign/unstratifiedArea', {exports: {unstratifiedAllocation$: ({allocation}) => of(allocation)}})
mock.module('#sepal/ee/samplingDesign/systematicSampling', {
    exports: {
        stratifiedSystematicExactCandidates: () => ({candidates: true}),
        selectSystematicLevels: ({samples}) => ({samples}),
        systematicSelectionSummary: selected => ({summaryOf: selected}),
        stratifiedSystematicFinalSamples: () => ({final: true})
    }
})
mock.module('#sepal/ee/samplingDesign/unstratifiedSystematicSampling', {
    exports: {
        unstratifiedSystematicIndexCandidates: () => ({candidates: true}),
        materializeSystematicIndexGeometry: () => collection({materialized: true})
    }
})
mock.module('#sepal/ee/samplingDesign/samples', {
    exports: {
        toDensitySummary: summary => summary,
        systematicStratumMaxOffset: () => 0,
        mergeRepairedCandidates: () => collection({merged: true}),
        finalizeSystematicSamples: () => ({set: properties => ({properties})})
    }
})
mock.module('#sepal/ee/samplingDesign/validateSampleCounts', {exports: {getSampleCounts$: () => of({1: 100})}})
mock.module('#gee/jobs/task/export/toAsset', {
    exports: {
        startTableToAssetExport$: params => defer(() => {
            earthEngine.exports.push(params.description)
            return of({eeTaskId: `export-${earthEngine.exports.length}`})
        })
    }
})
mock.module('#gee/jobs/task/export/toWorkspace', {exports: {startTableToWorkspaceExport$: () => of({eeTaskId: 'workspace'})}})

const {RecipeScope, inRecipeScope} = await import('#sepal/ee/recipeScope')
const {dependencyEvidence$} = await import('#gee/jobs/dependencyEvidence')
const {stratumFrameQuestion} = await import('#sepal/recipe/samplingDesign/stratumFrame')
const {systematicStep$} = await import('#gee/jobs/task/samplingDesign/systematicSteps')

let records

beforeEach(() => {
    earthEngine.exports = []
    Object.keys(assets).forEach(id => delete assets[id])
    records = {'classification-1': classification({revision: 1, legend: [1, 2]})}
})

describe('a sampling task', () => {
    it('samples a design whose areas are current', async () => {
        const design = await withAreas(stratified())

        await start(design)

        assert.equal(earthEngine.exports.length, 1)
    })

    it('refuses a design saved without area evidence before exporting, asking to reload and recalculate', async () => {
        await assert.rejects(start(stratified()), refusal('SAMPLING_DESIGN_UNKNOWN'))
        assert.deepEqual(earthEngine.exports, [])
    })

    it('refuses a later stage once the stratification changed meanwhile, before another export starts', async () => {
        const design = await withAreas(stratified())
        const {state} = await start(design)
        records['classification-1'] = classification({revision: 2, legend: [1, 2, 3]})

        await assert.rejects(stage(design, state), refusal('SAMPLING_DESIGN_STALE'))
        assert.equal(earthEngine.exports.length, 1)
    })

    it('samples on at a later stage when the stratification only changed its title meanwhile', async () => {
        const design = await withAreas(stratified())
        const {state} = await start(design)
        records['classification-1'] = {...classification({revision: 2, legend: [1, 2]}), title: 'Renamed'}

        await stage(design, state)
    })

    it('refuses a stratification asset replaced at the same id', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't1'}
        const design = await withAreas(stratifiedOverAsset())
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't2'}

        await assert.rejects(start(design), refusal('SAMPLING_DESIGN_STALE'))
    })

    it('refuses a source that cannot report replacement, however it was calculated', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: null, unversioned: true}
        const design = await withAreas(stratifiedOverAsset())

        await assert.rejects(start(design), refusal('SAMPLING_DESIGN_UNVERSIONED'))
    })

    it('refuses automatic proportions calculated over another frame, though the areas are current', async () => {
        const design = await withAreas(stratified())
        const otherFrame = {...design.model.stratification.strataCalculatedFrom.dependencies.SAMPLING_STRATUM_FRAME, digest: 'another frame'}

        await assert.rejects(start(withProportions(design, otherFrame)), refusal('SAMPLING_DESIGN_STALE'))
    })

    it('samples an unstratified design with automatic proportions and no area evidence', async () => {
        const design = unstratified()

        await start(withProportions(design, await frameOf(design.model)))

        assert.equal(earthEngine.exports.length, 1)
    })
})

const stratified = () => recipe({type: 'RECIPE', recipeId: 'classification-1', band: 'class', skip: false})

const stratifiedOverAsset = () => recipe({type: 'ASSET', assetId: 'users/alice/strata', band: 'class', skip: false})

const unstratified = () => recipe({skip: true})

const recipe = stratification => ({
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]},
        stratification: {...stratification, scale: 10, crs: 'EPSG:6933', strata: [{stratum: 1, value: 1, weight: 1, area: 1e8}]},
        sampleAllocation: {allocation: [{stratum: 1, label: 'a', sampleSize: 100, area: 1e8, weight: 1}], minSamplesPerStratum: 2, allocationStrategy: 'PROPORTIONAL'},
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', minDistance: 60, gridOrigin: 'FIXED', seed: 1, crs: 'EPSG:6933'}
    }
})

const classification = ({revision, legend}) => ({
    id: 'classification-1', type: 'CLASSIFICATION', revision, title: 'Classes',
    model: {inputImagery: {images: []}, legend: {entries: legend.map(value => ({value}))}}
})

// The areas as the area operation saves them: the frame this design reads now, at its Scale.
const withAreas = async design => ({
    ...design,
    model: {
        ...design.model,
        stratification: {
            ...design.model.stratification,
            strataCalculatedFrom: {
                resource: {id: 'SAMPLING_STRATUM_AREAS', contractVersion: 1},
                question: {scale: design.model.stratification.scale},
                dependencies: {SAMPLING_STRATUM_FRAME: await frameOf(design.model)}
            }
        }
    }
})

const withProportions = (design, frame) => ({
    ...design,
    model: {...design.model, proportions: {anticipatedProportions: [{stratum: 1, proportion: 0.5}], stratumFrameEvidence: frame}}
})

const inScope = observable$ => inRecipeScope(new RecipeScope(id => of(records[id])), observable$)

const frameOf = model => lastValueFrom(inScope(dependencyEvidence$('SAMPLING_STRATUM_FRAME', stratumFrameQuestion(model))))

const request = design => ({description: 'design', recipe: design, properties: {}, destination: 'ASSET', assetId: 'projects/alice/assets/design', strategy: 'replace'})

const start = design => lastValueFrom(inScope(systematicStep$(request(design), {sepalUser: {username: 'alice'}})))

const stage = (design, state) => lastValueFrom(inScope(systematicStep$({...request(design), state}, {sepalUser: {username: 'alice'}})))

const refusal = errorCode => error => {
    assert.equal(error.errorCode, errorCode)
    return true
}

const collection = source => ({
    source,
    filter: () => collection(source),
    map: () => collection(source),
    merge: other => collection({merged: [source, other.source]})
})
