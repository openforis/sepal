import {beforeEach, describe, expect, it, vi} from 'vitest'

// Band Math and Masking over it through their real registrations, shared declarations, the common read and the generic
// Retrieve submission. What an acquisition would retain is resolved by the shared resolver from an observation of Band
// Math's running image; only the task API and notifications are replaced.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/body/process/recipe/recipeOutputPath', () => ({getTaskInfo: () => ({})}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))

const submitted = vi.hoisted(() => [])
vi.mock('~/apiRegistry', () => ({
    default: {
        tasks: {
            submit$: task => {
                submitted.push(task)
                return {subscribe: () => {}}
            }
        }
    }
}))

const {readImageOutput} = await import('#sepal/recipe/output/readImageOutput')
const {recipeType} = await import('#sepal/recipe/recipeTypeRegistry')
const {addRecipeType} = await import('../../recipeTypeRegistry')
const {default: bandMath} = await import('./bandMath')
const {default: masking} = await import('../masking/masking')
const {retrieveTask: bandMathTask} = await import('./bandMathRecipe')
const {retrieveTask: maskingTask} = await import('../masking/maskingRecipe')
const {buildMapDependencyGraph} = await import('../mapDependencyGraph')
const {readRecipeOutput} = await import('../recipeOutput')
const {physicalRequest, retrieveDecision, submitRetrieve} = await import('../retrieveOutput')

addRecipeType(bandMath())
addRecipeType(masking())

beforeEach(() => {
    submitted.length = 0
})

describe('a Band Math recipe\'s output', () => {
    it('offers nothing while its running image is observed, rather than its configured names', () => {
        const output = readOf(BAND_MATH)

        expect(output).toMatchObject({status: 'NEEDS_EVIDENCE', bands: [], acquisition: {kind: 'DESCRIBE'}})
    })

    it('offers its configured bands once its running image is observed', () => {
        const output = readOf(BAND_MATH, OBSERVED)

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(['dem2', 'change', 'coefs'])
    })
})

describe('retrieving a Band Math recipe', () => {
    it('exports scalars averaged and arrays sampled at coarser levels', () => {
        retrieve(BAND_MATH, bandMathTask, 'GEE')

        expect(submitted.map(({params: {image}}) => [image.bands.selection, image.pyramidingPolicy])).toEqual([[
            ['dem2', 'change', 'coefs'],
            {dem2: 'mean', change: 'mean', coefs: 'sample'}
        ]])
    })

    it('offers an array band to Earth Engine alone', () => {
        const output = readOf(BAND_MATH, OBSERVED)

        expect(retrieveDecision({output, pending: false, names: ['coefs']}).destinations)
            .toEqual({GEE: true, DRIVE: false, SEPAL: false})
    })
})

describe('retrieving a Masking recipe over Band Math', () => {
    // Band Math states its own policies, so the fallback Masking keeps for undeclared sources no longer reaches them.
    it('exports Band Math\'s policies, a scalar named change averaged like any other', () => {
        retrieve(MASKING, maskingTask, 'GEE')

        expect(submitted.map(({params: {image}}) => image.pyramidingPolicy)).toEqual([
            {dem2: 'mean', change: 'mean', coefs: 'sample'}
        ])
    })
})

// A doubled elevation, a maximum over elevation, and an expression over an input's array band.
const BAND_MATH = {
    id: 'band-math-1',
    type: 'BAND_MATH',
    title: 'Math',
    model: {
        inputImagery: {images: [
            {imageId: 'i-1', name: 'i1', type: 'ASSET', id: 'users/x/dem', includedBands: [{id: 'b1', name: 'elevation'}]},
            {imageId: 'i-2', name: 'i2', type: 'ASSET', id: 'users/x/segments', includedBands: [{id: 'b2', name: 'coefs'}]}
        ]},
        calculations: {calculations: [
            {imageId: 'c-1', name: 'c1', type: 'EXPRESSION', expression: 'i1.elevation * 2', dataType: 'int16',
                usedBands: [{id: 'b1', imageId: 'i-1', name: 'elevation'}], includedBands: [{id: 'b1', name: 'doubled'}]},
            {imageId: 'c-2', name: 'c2', type: 'FUNCTION', reducer: 'max', dataType: 'auto',
                usedBands: [{id: 'b1', imageId: 'i-1', name: 'elevation'}], includedBands: [{id: 'r', name: 'change'}]},
            {imageId: 'c-3', name: 'c3', type: 'EXPRESSION', expression: 'i2.coefs * 2', dataType: 'float',
                usedBands: [{id: 'b2', imageId: 'i-2', name: 'coefs'}], includedBands: [{id: 'b2', name: 'coefs'}]}
        ]},
        outputBands: {outputImages: [
            {imageId: 'c-1', outputBands: [{id: 'b1', name: 'doubled', defaultOutputName: 'doubled', outputName: 'dem2'}]},
            {imageId: 'c-2', outputBands: [{id: 'r', name: 'change', defaultOutputName: 'change'}]},
            {imageId: 'c-3', outputBands: [{id: 'b2', name: 'coefs', defaultOutputName: 'coefs'}]}
        ]}
    }
}

const MASKING = {
    id: 'masking-1',
    type: 'MASKING',
    title: 'Masked',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: BAND_MATH.id},
        imageMask: {type: 'ASSET', id: 'users/x/mask'}
    }
}

// What observing Band Math's running image shows: one band of each dimensionality, under the configured names.
const OBSERVED = [
    {name: 'dem2', dataType: {arrayDimensions: 0}},
    {name: 'change', dataType: {arrayDimensions: 0}},
    {name: 'coefs', dataType: {arrayDimensions: 1}}
]

const RECORDS = {[BAND_MATH.id]: BAND_MATH, [MASKING.id]: MASKING}

// A recipe's read as the session holds it, with what its acquisition would retain once Band Math's running image
// is observed - or nothing retained.
const readOf = (recipe, observed) => {
    const graph = buildMapDependencyGraph({recipe, loadedRecipes: RECORDS})
    const terminal = observed && acquired(graph, observed)
    return readRecipeOutput({recipe, product: {name: 'IMAGE_OUTPUT'}, graph, heldFor: () => terminal})
}

const acquired = (graph, observed) => {
    const {description, diagnostics} = readImageOutput({
        graph,
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        observationFor: ({type, id}) => type === 'RECIPE_REF' && id === BAND_MATH.id ? {bands: observed} : undefined
    })
    return {status: 'READY', description, diagnostics, error: null, dependencyValidity: {status: 'VALID', diagnostics: []}}
}

const retrieve = (recipe, task, destination) => {
    const output = readOf(recipe, OBSERVED)
    return submitRetrieve({
        recipe,
        output,
        pending: false,
        request: physicalRequest({output, retrieveOptions: {scale: 30, assetId: 'users/x/out', destination, useAllBands: true}}),
        task
    })
}
