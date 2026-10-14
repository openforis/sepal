import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// A recipe whose image zips its input images cannot run without one: execution builds nothing from none. That is a
// finding of its configuration, at its input list, whatever its description says - and every recipe whose image builds
// it cannot run either. An input selected but not yet read, gone, or lacking a band it selects is not that: what its
// source establishes is said as that, or awaited. Codes, statuses and persisted field names are literals.

const MISSING_INPUT_IMAGERY = {code: 'MISSING_ROLE', path: ['model', 'inputImagery', 'images'], recipePath: ['recipe-1']}

describe('a recipe without input imagery', () => {
    it.each([
        ['a Classification', () => classification()],
        ['a Regression', () => regression()],
        ['an Unsupervised Classification', () => clustering()],
        ['a Stack', () => stack()],
        ['a Remapping', () => remapping()]
    ])('%s cannot run, found at its input list', (_case, recipeOf) => {
        const result = read(withImages(recipeOf(), []), [])

        expect(result.readiness.findings).toEqual([MISSING_INPUT_IMAGERY])
    })

    it('without a list at all cannot run either', () => {
        const {inputImagery: _inputImagery, ...model} = classification().model

        expect(read({...classification(), model}, []).readiness.findings).toEqual([MISSING_INPUT_IMAGERY])
    })

    it('a Band Math cannot run, beside the refusal of its description for having no output bands', () => {
        const result = read(withImages(bandMath(), []), [])

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics.map(({code}) => code)).toEqual(['NO_OUTPUT_BANDS'])
        expect(result.readiness.findings).toContainEqual(MISSING_INPUT_IMAGERY)
        expect(result.readiness.findings.map(({code}) => code).sort()).toEqual(['MISSING_ROLE', 'NO_OUTPUT_BANDS'])
    })

    it('a Classification without training data either cannot run for both', () => {
        const recipe = withImages({...classification(), model: {...classification().model, trainingData: {dataSets: []}}}, [])

        expect(read(recipe, []).readiness.findings.map(({code}) => code)).toEqual(['MISSING_ROLE', 'NO_TRAINING_DATA'])
    })

    it('keeps a Remapping over it from running, though the Remapping\'s description reads nothing of it', () => {
        const over = {...remapping(), id: 'remapping-2', model: {...remapping().model, inputImagery: {images: [recipeInput('recipe-1')]}}}

        const result = read(over, [withImages(classification(), [])])

        expect(result.status).toBe('READY')
        expect(result.readiness.findings).toEqual([{...MISSING_INPUT_IMAGERY, recipePath: ['remapping-2', 'recipe-1']}])
    })

    // Training data is read from it by the Classification it trains, not its image.
    it('does not keep a Classification trained on it from running', () => {
        const trained = {
            ...classification(),
            id: 'classification-2',
            model: {...classification().model, trainingData: {dataSets: [{type: 'RECIPE', recipe: 'recipe-1'}]}}
        }

        expect(read(trained, [COMPOSITE, withImages(classification(), [])]).readiness.status).toBe('READY')
    })
})

describe('a recipe with an input image', () => {
    it('can run once one is added', () => {
        expect(read(classification(), [COMPOSITE]).readiness.status).toBe('READY')
    })

    it('not yet loaded waits for it, finding nothing missing', () => {
        const result = read(classification(), [])

        expect(result.readiness).toMatchObject({status: 'NEEDS_EVIDENCE', findings: []})
        expect(result.readiness.needs.records).toEqual([COMPOSITE.id])
    })

    it('whose asset is not yet observed waits for it, finding nothing missing', () => {
        const result = read(withImages(classification(), [assetInput(['elevation'])]), [])

        expect(result.readiness).toMatchObject({status: 'NEEDS_EVIDENCE', findings: []})
    })

    it('whose asset lacks a band it selects is refused for that band alone', () => {
        const result = read(withImages(classification(), [assetInput(['elevation'])]), [], {[DEM]: ['slope']})

        expect(result.diagnostics.map(({code}) => code)).toEqual(['MISSING_INPUT_BAND'])
        expect(result.readiness.findings.map(({code}) => code)).toEqual(['MISSING_INPUT_BAND'])
    })
})

const DEM = 'users/x/dem'

// A Landsat composite, described from its configuration.
const COMPOSITE = {
    id: 'composite-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}

const recipeInput = id => ({imageId: `image-${id}`, type: 'RECIPE_REF', id, includedBands: [{band: 'class'}]})

const compositeInput = {
    imageId: 'image-1', type: 'RECIPE_REF', id: COMPOSITE.id,
    bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}],
    includedBands: [{id: 'red', name: 'red', band: 'red'}]
}

const assetInput = included => ({imageId: 'image-2', type: 'ASSET', id: DEM, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]})

const withImages = (recipe, images) => ({...recipe, model: {...recipe.model, inputImagery: {images}}})

const POINTS = [{x: 1, y: 1, class: 1, value: 1}, {x: 2, y: 2, class: 2, value: 2}]

const classification = () => ({
    id: 'recipe-1',
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [compositeInput]},
        legend: {entries: [{value: 1}, {value: 2}]},
        trainingData: {dataSets: [{type: 'COLLECTED', referenceData: POINTS}]},
        classifier: {type: 'RANDOM_FOREST'}
    }
})

const regression = () => ({
    id: 'recipe-1',
    type: 'REGRESSION',
    model: {
        inputImagery: {images: [compositeInput]},
        trainingData: {dataSets: [{type: 'EE_TABLE', referenceData: POINTS}]},
        classifier: {type: 'RANDOM_FOREST'}
    }
})

const clustering = () => ({
    id: 'recipe-1',
    type: 'UNSUPERVISED_CLASSIFICATION',
    model: {inputImagery: {images: [compositeInput]}, clusterer: {type: 'KMEANS', numberOfClusters: 5}}
})

const stack = () => ({
    id: 'recipe-1',
    type: 'STACK',
    model: {inputImagery: {images: [compositeInput]}, bandNames: {bandNames: []}}
})

const bandMath = () => ({
    id: 'recipe-1',
    type: 'BAND_MATH',
    model: {inputImagery: {images: [compositeInput]}, calculations: {calculations: []}, outputBands: {outputImages: []}}
})

const remapping = () => ({
    id: 'recipe-1',
    type: 'REMAPPING',
    model: {inputImagery: {images: [compositeInput]}, legend: {entries: [{value: 1, constraints: []}]}}
})

// What the session holds: these records, and the bands held for each asset.
const read = (root, records, bandsByAsset = {}) => readImageOutput({
    graph: buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))}),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type),
    observationFor: ({type, id}) => type === 'ASSET' && bandsByAsset[id]
        ? {bands: bandsByAsset[id].map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
        : undefined
})
