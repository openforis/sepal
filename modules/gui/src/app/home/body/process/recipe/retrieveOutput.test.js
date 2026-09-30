import {beforeEach, describe, expect, it, vi} from 'vitest'

import {UNDECLARED_TYPE} from '#sepal/testSupport/recipe/undeclaredRecipeType'
// Retrieve over a recipe type that declares no output, added to the shared and GUI registries for these tests: the
// session's records, the shared graph, the common read and its legacy seam, the decision and the generic submitter. A legacy answer names
// the bands a type supplies and nothing more - it sends no policy, so Earth Engine's own default applies, it restricts
// no destination, and it never stands in for dependencies not known to be sound. Only the task API and notifications
// are replaced; the terminal a Retrieve panel's acquisition would retain is supplied where a scenario needs one.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// A recipe type that declares no output, added to the real registry for these tests.
vi.mock('#sepal/recipe/recipeTypeRegistry', async importOriginal => {
    const {withUndeclaredType} = await import('#sepal/testSupport/recipe/undeclaredRecipeType')
    return withUndeclaredType(await importOriginal())
})
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

const LEGACY_BANDS = {count: {dataType: {precision: 'int'}, label: 'Count'}}

addRecipeType({id: UNDECLARED_TYPE, getAvailableBands: () => LEGACY_BANDS, getPreSetVisualizations: () => []})

beforeEach(() => {
    submitted.length = 0
    notified.length = 0
})

describe('a recipe type declaring no output', () => {
    it('exports the bands it supplies with no policy, leaving Earth Engine\'s own default to apply', () => {
        retrieve(read([UNDECLARED]), {destination: 'GEE', bands: ['count']})

        expect(submitted.map(({params: {image}}) => image.bands)).toEqual([{selection: ['count']}])
        expect(submitted[0].params.image).not.toHaveProperty('pyramidingPolicy')
    })

    it('restricts no destination, stating no physical fact about its bands', () => {
        const {recipe, output, pending} = read([UNDECLARED])

        expect(retrieveDecision({recipe, output, pending, names: ['count'], destination: 'DRIVE'}))
            .toEqual(expect.objectContaining({status: 'RETRIEVABLE', destinations: {GEE: true, DRIVE: true, SEPAL: true}}))
    })

    it('names a saved band it does not supply, and exports nothing', () => {
        retrieve(read([UNDECLARED]), {destination: 'GEE', bands: ['count', 'observations']})

        expect(submitted).toEqual([])
        expect(notified).toHaveLength(1)
    })
})

describe('"all bands" of a recipe type declaring no output', () => {
    it('exports every band the type supplies', () => {
        retrieve(read([UNDECLARED]), {destination: 'GEE', useAllBands: true})

        expect(submitted[0].params.image.bands.selection).toEqual(Object.keys(LEGACY_BANDS))
    })
})

// The session has not loaded the recipe the area of interest is taken from, so whether its dependencies are sound is
// what the panel's acquisition completes.
describe('a recipe type declaring no output, over a dependency the session has not loaded', () => {
    it('is still being resolved until its dependencies are completed', () => {
        const {recipe, output, pending} = read([OVER_UNLOADED_AOI])

        expect(retrieveDecision({recipe, output, pending, names: ['count'], destination: 'GEE'}).status)
            .toBe('RESOLVING')
    })

    it.each([
        ['found unsound', {status: 'COMPLETE', error: null, dependencyValidity: {status: 'INVALID', diagnostics: [{code: 'MISSING_SOURCE'}]}}],
        ['not completed', {status: 'UNAVAILABLE', error: new Error('Unreachable'), dependencyValidity: null}]
    ])('exports nothing once they are %s', (_case, terminal) => {
        retrieve(read([OVER_UNLOADED_AOI], terminal), {destination: 'GEE', bands: ['count']})

        expect(submitted).toEqual([])
    })

    it('exports once they are known to be sound', () => {
        const completed = {status: 'COMPLETE', error: null, dependencyValidity: {status: 'VALID', diagnostics: []}}

        retrieve(read([OVER_UNLOADED_AOI], completed), {destination: 'GEE', bands: ['count']})

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

// A type with no Retrieve panel of its own, so nothing here names a task; its legacy entry supplies `count`.
const UNDECLARED = {
    id: 'undeclared-1',
    type: UNDECLARED_TYPE,
    title: 'Observations',
    model: {dates: {startDate: '2020-01-01', endDate: '2021-01-01'}}
}

const OVER_UNLOADED_AOI = {
    ...UNDECLARED,
    model: {...UNDECLARED.model, aoi: {type: 'RECIPE', id: 'aoi-recipe-1'}}
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
