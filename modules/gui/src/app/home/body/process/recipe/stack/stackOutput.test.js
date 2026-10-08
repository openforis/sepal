import {beforeEach, describe, expect, it, vi} from 'vitest'

// Stack and Masking over it through their real registrations, shared declarations, the common read and the generic
// Retrieve submission. What an acquisition would retain is resolved by the shared resolver from observations of the
// assets stacked; only the task API and notifications are replaced.

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
const {default: stack} = await import('./stack')
const {default: masking} = await import('../masking/masking')
const {retrieveTask: stackTask} = await import('./stackRecipe')
const {retrieveTask: maskingTask} = await import('../masking/maskingRecipe')
const {buildMapDependencyGraph} = await import('../mapDependencyGraph')
const {readRecipeOutput} = await import('../recipeOutput')
const {physicalRequest, retrieveDecision, submitRetrieve} = await import('../retrieveOutput')

addRecipeType(stack())
addRecipeType(masking())

beforeEach(() => {
    submitted.length = 0
})

describe('retrieving a Stack over assets', () => {
    it('exports a scalar its asset states no policy for averaged, and an array sampled', () => {
        retrieve(OVER_ASSETS, stackTask, 'GEE')

        expect(submitted.map(({params: {image}}) => [image.bands.selection, image.pyramidingPolicy])).toEqual([[
            ['dem', 'change', 'coefs'],
            {dem: 'mean', change: 'mean', coefs: 'sample'}
        ]])
    })

    it('offers an array band to Earth Engine alone', () => {
        expect(retrieveDecision({output: readOf(OVER_ASSETS), pending: false, names: ['coefs']}).destinations)
            .toEqual({GEE: true, DRIVE: false, SEPAL: false})
    })
})

describe('retrieving a Masking recipe over that Stack', () => {
    // Stack completes its own policies, so Masking's fallback for scalars without one never reaches them.
    it('exports Stack\'s policies, a scalar named change averaged like any other', () => {
        retrieve(MASKING, maskingTask, 'GEE')

        expect(submitted.map(({params: {image}}) => image.pyramidingPolicy)).toEqual([
            {dem: 'mean', change: 'mean', coefs: 'sample'}
        ])
    })
})

describe('a Stack over an input with no image output', () => {
    it('offers nothing, and exports nothing', () => {
        const output = readOf(OVER_DESIGN)
        retrieve(OVER_DESIGN, stackTask, 'GEE')

        expect(output).toMatchObject({status: 'INVALID', bands: []})
        expect(output.diagnostics).toEqual([{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['stack-2', DESIGN.id]}])
        expect(submitted).toEqual([])
    })

    it('offers nothing when its mapping names two output bands alike, naming that input too', () => {
        const output = readOf(DUPLICATED_OVER_DESIGN)

        expect(output).toMatchObject({status: 'INVALID', bands: []})
        expect(output.diagnostics.map(({code}) => code)).toEqual(['NON_IMAGE_OUTPUT', 'DUPLICATE_BAND_NAME'])
        expect(retrieveDecision({output, pending: false, names: ['x']})).toMatchObject({status: 'BLOCKED', reason: 'UNRESOLVED_OUTPUT'})
    })
})

const DEM = {type: 'ASSET', id: 'users/x/dem'}
const SEGMENTS = {type: 'ASSET', id: 'users/x/segments'}

// What reading each asset shows: scalars stated no policy, and an array sampled.
const ASSET_BANDS = {
    [DEM.id]: [{name: 'elevation', dataType: {arrayDimensions: 0}}, {name: 'change', dataType: {arrayDimensions: 0}}],
    [SEGMENTS.id]: [{name: 'coefs', dataType: {arrayDimensions: 2}, pyramidingPolicy: 'sample'}]
}

const DESIGN = {id: 'design-1', type: 'SAMPLING_DESIGN', model: {aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]}}}

const stackOf = (id, images, bandNames) => ({id, type: 'STACK', title: 'Stacked', model: {inputImagery: {images}, bandNames: {bandNames}}})

const mapping = (imageId, pairs) => ({
    imageId,
    bands: pairs.map(([originalName, outputName], index) => ({id: `${imageId}-${index}`, originalName, outputName}))
})

const OVER_ASSETS = stackOf('stack-1',
    [{imageId: 'i-1', ...DEM}, {imageId: 'i-2', ...SEGMENTS}],
    [mapping('i-1', [['elevation', 'dem'], ['change', 'change']]), mapping('i-2', [['coefs', 'coefs']])]
)

const MASKING = {
    id: 'masking-1',
    type: 'MASKING',
    title: 'Masked',
    model: {imageToMask: {type: 'RECIPE_REF', id: OVER_ASSETS.id}, imageMask: DEM}
}

const OVER_DESIGN = stackOf('stack-2',
    [{imageId: 'i-1', type: 'RECIPE_REF', id: DESIGN.id}],
    [mapping('i-1', [['class', 'stratum']])]
)

const DUPLICATED_OVER_DESIGN = stackOf('stack-3',
    [{imageId: 'i-1', type: 'RECIPE_REF', id: DESIGN.id}, {imageId: 'i-2', ...DEM}],
    [mapping('i-1', [['class', 'x']]), mapping('i-2', [['elevation', 'x']])]
)

const RECORDS = Object.fromEntries([OVER_ASSETS, MASKING, OVER_DESIGN, DUPLICATED_OVER_DESIGN, DESIGN]
    .map(record => [record.id, record]))

// A recipe's read as the session holds it, with what its acquisition would retain once the assets it stacks are
// observed.
const readOf = recipe => {
    const graph = buildMapDependencyGraph({recipe, loadedRecipes: RECORDS})
    const {status, description, diagnostics} = readImageOutput({
        graph,
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        observationFor: ({type, id}) => type === 'ASSET' ? {bands: ASSET_BANDS[id], evidence: []} : undefined
    })
    const terminal = {status, description, diagnostics, error: null, dependencyValidity: {status: 'VALID', diagnostics: []}}
    return readRecipeOutput({recipe, product: {name: 'IMAGE_OUTPUT'}, graph, heldFor: () => terminal})
}

const retrieve = (recipe, task, destination) => {
    const output = readOf(recipe)
    return submitRetrieve({
        recipe,
        output,
        pending: false,
        request: physicalRequest({output, retrieveOptions: {scale: 30, assetId: 'users/x/out', destination, useAllBands: true}}),
        task
    })
}
