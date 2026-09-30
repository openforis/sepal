import {beforeEach, describe, expect, it, vi} from 'vitest'

// Retrieve over the real shared declarations: the session's records, the shared graph, the common read, the decision
// and the generic submitter. What is exported is what the description says, with the policies it declares, and never
// over dependencies not known to be sound. Only the task API and notifications are replaced; the terminal a Retrieve
// panel's acquisition would retain is supplied where a scenario needs one.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/body/process/recipe/recipeOutputPath', () => ({getTaskInfo: () => ({})}))

const notified = vi.hoisted(() => [])
vi.mock('~/widget/notifications', () => ({Notifications: {error: notification => notified.push(notification)}}))

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

const {addRecipeType} = await import('../recipeTypeRegistry')
const {physicalRequest, readRetrieveOutput, retrieveDecision, submitRetrieve} = await import('./retrieveOutput')
const {canPreview} = await import('./recipeOutput')

// Registered in the GUI without a Retrieve panel of its own, so nothing here names a task.
addRecipeType({id: 'RADAR_MOSAIC', getPreSetVisualizations: () => []})

beforeEach(() => {
    submitted.length = 0
    notified.length = 0
})

describe('a described recipe', () => {
    it('exports the bands selected, in its order, with the policies it declares', () => {
        retrieve(read([RADAR]), {destination: 'GEE', bands: ['orbit', 'VV']})

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy])).toEqual([[
            {selection: ['VV', 'orbit']},
            {VV: 'mean', orbit: 'mode'}
        ]])
    })

    it('names a saved band it does not provide, and exports nothing', () => {
        retrieve(read([RADAR]), {destination: 'GEE', bands: ['VV', 'VV_med']})

        expect(submitted).toEqual([])
        expect(notified).toHaveLength(1)
    })

    it('exports every band it describes for "all bands"', () => {
        retrieve(read([RADAR]), {destination: 'GEE', useAllBands: true})

        expect(submitted[0].params.image.bands.selection).toEqual(['VV', 'VH', 'ratio_VV_VH', 'orbit', 'dayOfYear', 'daysFromTarget'])
    })
})

// The session has not loaded the recipe the area of interest is taken from, so whether its dependencies are sound is
// what the panel's acquisition completes.
describe('a described recipe over a dependency the session has not loaded', () => {
    it('is still being resolved until its dependencies are completed', () => {
        const {recipe, output, pending} = read([OVER_UNLOADED_AOI])

        expect(retrieveDecision({recipe, output, pending, names: ['VV'], destination: 'GEE'}).status)
            .toBe('RESOLVING')
    })

    // What the acquisition retains: the description it completed, and whether the dependencies were found sound.
    const described = dependencyValidity => ({
        status: 'READY',
        description: read([OVER_UNLOADED_AOI]).output.description,
        diagnostics: [],
        error: null,
        dependencyValidity
    })

    it.each([
        ['found unsound', described({status: 'INVALID', diagnostics: [{code: 'MISSING_SOURCE'}]})],
        ['not completed', {status: 'UNAVAILABLE', error: new Error('Unreachable'), dependencyValidity: null}]
    ])('exports nothing once they are %s', (_case, terminal) => {
        retrieve(read([OVER_UNLOADED_AOI], terminal), {destination: 'GEE', bands: ['VV']})

        expect(submitted).toEqual([])
    })

    it('exports once they are known to be sound', () => {
        retrieve(read([OVER_UNLOADED_AOI], described({status: 'VALID', diagnostics: []})), {destination: 'GEE', bands: ['VV']})

        expect(submitted).toHaveLength(1)
    })
})

// A Sampling Design's samples are exported by its own tasks. Read as an image it has none, which no evidence changes:
// nothing is previewed or retrieved, over it or over a recipe that reads it.
describe('a recipe producing no image', () => {
    const DESIGN = {id: 'design-1', type: 'SAMPLING_DESIGN', model: {aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]}}}
    const MASKED = {id: 'masking-1', type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: DESIGN.id}}}

    it('is read as having no image output, and is neither previewed nor retrieved', () => {
        const answer = read([DESIGN])

        retrieve(answer, {destination: 'GEE', bands: ['class']})

        expect(answer.output).toMatchObject({
            status: 'INVALID',
            diagnostics: [{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: [DESIGN.id]}]
        })
        expect(canPreview(answer.output)).toBe(false)
        expect(submitted).toEqual([])
        expect(notified).toHaveLength(1)
    })

    it('refuses a Masking over one, located at the design', () => {
        const answer = read([MASKED, DESIGN])

        retrieve(answer, {destination: 'GEE', bands: ['class']})

        expect(answer.output.diagnostics).toEqual([{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: [MASKED.id, DESIGN.id]}])
        expect(submitted).toEqual([])
    })
})

// A point in time over an area drawn on the map.
const RADAR = {
    id: 'radar-1',
    type: 'RADAR_MOSAIC',
    title: 'Radar',
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]},
        dates: {targetDate: '2024-06-01'},
        options: {orbits: ['ASCENDING', 'DESCENDING']}
    }
}

const OVER_UNLOADED_AOI = {
    ...RADAR,
    model: {...RADAR.model, aoi: {type: 'RECIPE', id: 'aoi-recipe-1'}}
}

// The read a panel would make of the first recipe, with the others loaded beside it, retaining `held` if given.
const read = ([recipe, ...others], held = null) => readRetrieveOutput({
    state: {process: {loadedRecipes: Object.fromEntries([recipe, ...others].map(record => [record.id, record]))}},
    recipeId: recipe.id,
    heldFor: () => held
})

const retrieve = ({recipe, output, pending}, retrieveOptions, task) => submitRetrieve({
    recipe,
    output,
    pending,
    request: physicalRequest({output, retrieveOptions: {scale: 30, assetId: 'users/x/out', ...retrieveOptions}}),
    task
})
