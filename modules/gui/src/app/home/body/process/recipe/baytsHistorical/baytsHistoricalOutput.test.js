import {beforeEach, describe, expect, it, vi} from 'vitest'

// Masking and Stack over a BAYTS Historical through their real registrations, shared declarations, the common read and
// the generic Retrieve submission. Only the task API and notifications are replaced.

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
const {default: baytsHistorical} = await import('./baytsHistorical')
const {default: masking} = await import('../masking/masking')
const {default: stack} = await import('../stack/stack')
const {retrieveTask: maskingTask} = await import('../masking/maskingRecipe')
const {retrieveTask: stackTask} = await import('../stack/stackRecipe')
const {buildMapDependencyGraph} = await import('../mapDependencyGraph')
const {readRecipeOutput} = await import('../recipeOutput')
const {physicalRequest, submitRetrieve} = await import('../retrieveOutput')

addRecipeType(baytsHistorical())
addRecipeType(masking())
addRecipeType(stack())

beforeEach(() => {
    submitted.length = 0
})

describe('a Masking over a BAYTS Historical', () => {
    it('offers its statistics, and exports the bands selected with their policies', () => {
        const output = readOf(MASKING)
        retrieve(MASKING, maskingTask, {bands: ['orbit_desc', 'VV_mean_asc']})

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual([...pass('asc'), ...pass('desc')])
        expect(submitted.map(({params: {image}}) => [image.bands.selection, image.pyramidingPolicy])).toEqual([[
            ['VV_mean_asc', 'orbit_desc'],
            {VV_mean_asc: 'mean', orbit_desc: 'mode'}
        ]])
    })
})

describe('a Stack over a BAYTS Historical', () => {
    it('exports its bands under the names it gives them, keeping the most common orbit', () => {
        retrieve(STACK, stackTask, {useAllBands: true})

        expect(submitted.map(({params: {image}}) => [image.bands.selection, image.pyramidingPolicy])).toEqual([[
            ['orbit', 'vv'],
            {orbit: 'mode', vv: 'mean'}
        ]])
    })
})

const pass = suffix => ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit', 'VV_speckle', 'VH_speckle']
    .map(statistic => `${statistic}_${suffix}`)

const HISTORICAL = {
    id: 'historical-1',
    type: 'BAYTS_HISTORICAL',
    title: 'Historical',
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [1, 0]]},
        dates: {fromDate: '2023-01-01', toDate: '2024-01-01'},
        options: {orbits: ['ASCENDING', 'DESCENDING'], spatialSpeckleFilter: 'LEE', multitemporalSpeckleFilter: 'NONE'}
    }
}

const MASKING = {
    id: 'masking-1',
    type: 'MASKING',
    title: 'Masked',
    model: {imageToMask: {type: 'RECIPE_REF', id: HISTORICAL.id}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
}

const STACK = {
    id: 'stack-1',
    type: 'STACK',
    title: 'Stacked',
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: HISTORICAL.id}]},
        bandNames: {bandNames: [{imageId: 'i-1', bands: [
            {id: 'b1', originalName: 'orbit_desc', outputName: 'orbit'},
            {id: 'b2', originalName: 'VV_mean_asc', outputName: 'vv'}
        ]}]}
    }
}

const RECORDS = Object.fromEntries([HISTORICAL, MASKING, STACK].map(record => [record.id, record]))

// A recipe's read as the session holds it, with what its acquisition would retain. Nothing here needs observing.
const readOf = recipe => {
    const graph = buildMapDependencyGraph({recipe, loadedRecipes: RECORDS})
    const {status, description, diagnostics} = readImageOutput({
        graph,
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        observationFor: () => undefined
    })
    const terminal = {status, description, diagnostics, error: null, dependencyValidity: {status: 'VALID', diagnostics: []}}
    return readRecipeOutput({recipe, product: {name: 'IMAGE_OUTPUT'}, graph, heldFor: () => terminal})
}

const retrieve = (recipe, task, selection) => {
    const output = readOf(recipe)
    return submitRetrieve({
        recipe,
        output,
        pending: false,
        request: physicalRequest({output, retrieveOptions: {scale: 30, assetId: 'users/x/out', destination: 'GEE', ...selection}}),
        task
    })
}
