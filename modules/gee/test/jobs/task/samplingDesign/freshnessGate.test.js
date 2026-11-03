import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {defer, lastValueFrom, of} from 'rxjs'

// Whether a sampling task samples the design its areas and automatic proportions were calculated for, and its allocation
// reviewed for, judged at every stage from what that stage's own request reads: everything the proportions read, and what
// the allocation was reviewed for, at admission, the frame alone at later stages. The recipe service, asset metadata and Earth Engine are substituted; the stages, the gate, the evidence
// producer and the comparison are production's.

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
const {stratumFrameQuestion, stratumFrameQuestionOf} = await import('#sepal/recipe/samplingDesign/stratumFrame')
const {probabilitySourceQuestion, stratumProbabilitiesQuestion} = await import('#sepal/recipe/samplingDesign/stratumProbabilities')
const {allocationReviewInputs} = await import('#sepal/recipe/samplingDesign/allocationReview')
const {systematicStep$} = await import('#gee/jobs/task/samplingDesign/systematicSteps')

let records

beforeEach(() => {
    earthEngine.exports = []
    Object.keys(assets).forEach(id => delete assets[id])
    records = {
        'classification-1': classification({revision: 1, legend: [1, 2]}),
        'probability-1': probabilityRecipe({revision: 1, inputId: 'mosaic-1'}),
        'mosaic-1': mosaic({revision: 1, compose: 'MEDIAN'})
    }
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

        await assert.rejects(start(await withProportions(design, {frame: otherFrame})), refusal('SAMPLING_DESIGN_STALE'))
    })

    it('samples an unstratified design with automatic proportions and no area evidence', async () => {
        await start(await withProportions(unstratified()))

        assert.equal(earthEngine.exports.length, 1)
    })

    it('samples an unstratified design stating no CRS, whose proportions were calculated in the CRS asked for it', async () => {
        const design = recipe({skip: true, crs: undefined})
        const askedFrame = await frameAsked({aoi: design.model.aoi, stratification: null, band: null, crs: 'EPSG:6933'})

        await start(await withProportions(design, {frame: askedFrame}))

        assert.equal(earthEngine.exports.length, 1)
    })
})

describe('a sampling task admitted over automatic proportions', () => {
    it('is refused before exporting once the probability recipe changed, though the strata are as calculated', async () => {
        const design = await withProportions(await withAreas(stratified()))
        records['probability-1'] = {...probabilityRecipe({revision: 2, inputId: 'mosaic-1'}), model: {...records['probability-1'].model, threshold: 2}}

        await assert.rejects(start(design), refusal('SAMPLING_DESIGN_STALE'))
        assert.deepEqual(earthEngine.exports, [])
    })

    it('is refused once a recipe the probability recipe reads changed', async () => {
        const design = await withProportions(await withAreas(stratified()))
        records['mosaic-1'] = mosaic({revision: 2, compose: 'MEDOID'})

        await assert.rejects(start(design), refusal('SAMPLING_DESIGN_STALE'))
    })

    it('is refused once the probability asset was replaced at the same id', async () => {
        assets['users/alice/probability'] = {type: 'IMAGE', version: 't1'}
        const design = await withProportions(await withAreas(stratified()), {source: overAsset})
        assets['users/alice/probability'] = {type: 'IMAGE', version: 't2'}

        await assert.rejects(start(design), refusal('SAMPLING_DESIGN_STALE'))
    })

    it('is admitted when the probability recipe only changed its title', async () => {
        const design = await withProportions(await withAreas(stratified()))
        records['probability-1'] = {...probabilityRecipe({revision: 2, inputId: 'mosaic-1'}), title: 'Renamed'}

        await start(design)

        assert.equal(earthEngine.exports.length, 1)
    })

    it('is refused over a probability source that cannot report replacement', async () => {
        assets['gs://bucket/probability.tif'] = {type: 'IMAGE', version: null, unversioned: true}
        const design = await withProportions(await withAreas(stratified()), {source: overCloudGeoTiff})

        await assert.rejects(start(design), refusal('SAMPLING_DESIGN_UNVERSIONED'))
    })

    it('is refused with frame evidence alone, asking to reload and recalculate, before exporting', async () => {
        const design = await withAreas(stratified())

        await assert.rejects(start(withFrameEvidenceOnly(design, await frameOf(design.model))), error => {
            assert.equal(error.errorCode, 'SAMPLING_DESIGN_UNKNOWN')
            assert.match(error.userMessage.message, /Reload the page and recalculate/)
            return true
        })
        assert.deepEqual(earthEngine.exports, [])
    })

    it('is refused where a client of the previous release saved its values beside full evidence', async () => {
        const design = await withProportions(await withAreas(stratified()))
        const carried = {...design, model: {...design.model, proportions: {...design.model.proportions, stratumFrameEvidence: null}}}

        await assert.rejects(start(carried), refusal('SAMPLING_DESIGN_UNKNOWN'))
    })
})

describe('a sampling task over an allocation not reviewed for the design as it is', () => {
    for (const [name, unreviewed, errorCode] of [
        ['saved without a record of what it was reviewed for', design => withAllocation(design, {reviewedInputs: undefined}), 'SAMPLING_DESIGN_ALLOCATION_UNREVIEWED'],
        ['last applied by an earlier version, its flag false', design => withAllocation(design, {requiresUpdate: false}), 'SAMPLING_DESIGN_ALLOCATION_UNTRUSTED'],
        ['whose strata were reweighed since', design => withStrata(design, [{stratum: 1, value: 1, weight: 0.5, area: 1e8}]), 'SAMPLING_DESIGN_ALLOCATION_INPUTS_CHANGED']
    ]) {
        it(`is refused before exporting, asking to review it: ${name}`, async () => {
            const design = unreviewed(await withProportions(await withAreas(stratified())))

            await assert.rejects(start(design), error => {
                assert.equal(error.errorCode, errorCode)
                assert.match(error.userMessage.message, /review Sample Allocation, apply it and retrieve again/)
                return true
            })
            assert.deepEqual(earthEngine.exports, [])
        })
    }

    it('admitted by a release that recorded no review, samples on at a later stage with the allocation it was submitted with', async () => {
        const design = await withProportions(await withAreas(stratified()))
        const {state} = await start(design)

        await stage(withAllocation(design, {reviewedInputs: undefined}), state)
    })
})

describe('a later stage of a sampling task', () => {
    it('samples on after a probability-only change, using the allocation it was submitted with', async () => {
        const design = await withProportions(await withAreas(stratified()))
        const {state} = await start(design)
        records['probability-1'] = {...probabilityRecipe({revision: 2, inputId: 'mosaic-1'}), model: {...records['probability-1'].model, threshold: 2}}

        await stage(design, state)
    })

    it('of a task admitted with frame evidence alone samples on after a probability-only change', async () => {
        const design = await withAreas(stratified())
        const {state} = await start(await withProportions(design))
        const admittedEarlier = withFrameEvidenceOnly(design, await frameOf(design.model))
        records['mosaic-1'] = mosaic({revision: 2, compose: 'MEDOID'})

        await stage(admittedEarlier, state)
    })

    it('is refused once the frame the proportions were admitted with changed, for new and earlier tasks alike', async () => {
        records['aoi-recipe'] = {id: 'aoi-recipe', type: 'MOSAIC', revision: 1, model: {aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}}}
        const design = {...unstratified(), model: {...unstratified().model, aoi: {type: 'RECIPE', id: 'aoi-recipe'}}}
        const admitted = await withProportions(design)
        const admittedEarlier = withFrameEvidenceOnly(design, await frameOf(design.model))
        const {state} = await start(admitted)
        records['aoi-recipe'] = {...records['aoi-recipe'], revision: 2, model: {aoi: {type: 'POLYGON', path: [[0, 0], [0, 2], [2, 2]]}}}

        await assert.rejects(stage(admitted, state), refusal('SAMPLING_DESIGN_STALE'))
        await assert.rejects(stage(admittedEarlier, state), refusal('SAMPLING_DESIGN_STALE'))
    })
})

const stratified = () => recipe({type: 'RECIPE', recipeId: 'classification-1', band: 'class', skip: false})

const stratifiedOverAsset = () => recipe({type: 'ASSET', assetId: 'users/alice/strata', band: 'class', skip: false})

const unstratified = () => recipe({skip: true})

// Its allocation reviewed for the design as it is, as the GUI submits it.
const recipe = stratification => reviewed({
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]},
        stratification: {...stratification, scale: 10, crs: 'EPSG:6933', strata: [{stratum: 1, value: 1, weight: 1, area: 1e8}]},
        sampleAllocation: {allocation: [{stratum: 1, label: 'a', sampleSize: 100, area: 1e8, weight: 1}], minSamplesPerStratum: 2, allocationStrategy: 'PROPORTIONAL'},
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', minDistance: 60, gridOrigin: 'FIXED', seed: 1, crs: 'EPSG:6933'}
    }
})

const reviewed = design => withAllocation(design, {reviewedInputs: allocationReviewInputs(design.model)})

const withAllocation = (design, changes) => ({
    ...design,
    model: {...design.model, sampleAllocation: {...design.model.sampleAllocation, ...changes}}
})

const withStrata = (design, strata) => ({
    ...design,
    model: {...design.model, stratification: {...design.model.stratification, strata}}
})

const classification = ({revision, legend}) => ({
    id: 'classification-1', type: 'CLASSIFICATION', revision, title: 'Classes',
    model: {inputImagery: {images: []}, legend: {entries: legend.map(value => ({value}))}}
})

const probabilityRecipe = ({revision, inputId}) => ({
    id: 'probability-1', type: 'CLASSIFICATION', revision, title: 'Probability',
    model: {inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: inputId}]}, legend: {entries: [{value: 1}]}}
})

const mosaic = ({revision, compose}) => ({id: 'mosaic-1', type: 'MOSAIC', revision, model: {compositeOptions: {compose}}})

const overRecipe = {type: 'RECIPE', recipeId: 'probability-1', band: 'probability'}

const overAsset = {type: 'ASSET', assetId: 'users/alice/probability', band: 'probability'}

const overCloudGeoTiff = {type: 'ASSET', assetId: 'gs://bucket/probability.tif', band: 'probability'}

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

// Automatic proportions as the probability operation saves them: what this design reads now, unless told otherwise, and
// the allocation reviewed over them.
const withProportions = async (design, {frame, source = overRecipe} = {}) => {
    const model = {
        ...design.model,
        proportions: {anticipationStrategy: 'PROBABILITY', ...source, scale: 30, anticipatedProportions: [{stratum: 1, proportion: 0.5}]}
    }
    const calculatedFrom = {
        resource: {id: 'SAMPLING_STRATUM_PROBABILITIES', contractVersion: 1},
        question: stratumProbabilitiesQuestion(model),
        dependencies: {
            SAMPLING_STRATUM_FRAME: frame ?? await frameOf(model),
            SAMPLING_PROBABILITY_SOURCE: await evidenceOf('SAMPLING_PROBABILITY_SOURCE', probabilitySourceQuestion(model))
        }
    }
    return reviewed({...design, model: {...model, proportions: {...model.proportions, probabilityPerStratumCalculatedFrom: calculatedFrom}}})
}

// Automatic proportions as a client of the previous release saved them, the allocation reviewed over them.
const withFrameEvidenceOnly = (design, frame) => reviewed({
    ...design,
    model: {
        ...design.model,
        proportions: {anticipationStrategy: 'PROBABILITY', ...overRecipe, scale: 30, anticipatedProportions: [{stratum: 1, proportion: 0.5}], stratumFrameEvidence: frame}
    }
})

const inScope = observable$ => inRecipeScope(new RecipeScope(id => of(records[id])), observable$)

const evidenceOf = (dependency, question) => lastValueFrom(inScope(dependencyEvidence$(dependency, question)))

const frameOf = model => evidenceOf('SAMPLING_STRATUM_FRAME', stratumFrameQuestion(model))

// The frame as an operation records it from the request it was asked.
const frameAsked = request => evidenceOf('SAMPLING_STRATUM_FRAME', stratumFrameQuestionOf(request))

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
