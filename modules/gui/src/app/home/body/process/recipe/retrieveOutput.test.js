import {beforeEach, describe, expect, it, vi} from 'vitest'

// Retrieve over recipe types that declare no output, through their real registrations: the session's records, the
// shared graph, the common read and its legacy seam, the decision and the generic submitter. A legacy answer names
// the bands a type supplies and nothing more - it sends no policy, so Earth Engine's own default applies, it restricts
// no destination, and it never stands in for dependencies not known to be sound. Only the task API and notifications
// are replaced; the terminal a Retrieve panel's acquisition would retain is supplied where a scenario needs one.

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
const {default: stack} = await import('./stack/stack')
const {default: baytsHistorical} = await import('./baytsHistorical/baytsHistorical')
const {retrieveTask: stackTask} = await import('./stack/stackRecipe')
const {retrieveTask: baytsHistoricalTask} = await import('./baytsHistorical/baytsHistoricalRecipe')
const {getAvailableBands: baytsHistoricalBands} = await import('./baytsHistorical/bands')
const {physicalRequest, readRetrieveOutput, retrieveDecision, submitRetrieve} = await import('./retrieveOutput')

addRecipeType(stack())
addRecipeType(baytsHistorical())

beforeEach(() => {
    submitted.length = 0
    notified.length = 0
})

describe('a recipe type declaring no output', () => {
    it('exports the bands it supplies with no policy, leaving Earth Engine\'s own default to apply', () => {
        retrieve(read([STACK, SOURCE]), {destination: 'GEE', bands: ['red_1']}, stackTask)

        expect(submitted.map(({params: {image}}) => image.bands)).toEqual([{selection: ['red_1']}])
        expect(submitted[0].params.image).not.toHaveProperty('pyramidingPolicy')
    })

    it('restricts no destination, stating no physical fact about its bands', () => {
        const {recipe, output, pending} = read([STACK, SOURCE])

        expect(retrieveDecision({recipe, output, pending, names: ['red_1'], destination: 'DRIVE', task: stackTask}))
            .toEqual(expect.objectContaining({status: 'RETRIEVABLE', destinations: {GEE: true, DRIVE: true, SEPAL: true}}))
    })

    it('names a saved band it no longer supplies, and exports nothing', () => {
        retrieve(read([STACK, SOURCE]), {destination: 'GEE', bands: ['red_1', 'nir_1']}, stackTask)

        expect(submitted).toEqual([])
        expect(notified).toHaveLength(1)
    })
})

describe('"all bands" of a recipe type declaring no output', () => {
    it('exports every band the type supplies', () => {
        retrieve(read([BAYTS_HISTORICAL]), {destination: 'GEE', useAllBands: true}, baytsHistoricalTask)

        expect(submitted[0].params.image.bands.selection).toEqual(Object.keys(baytsHistoricalBands(BAYTS_HISTORICAL)))
    })
})

// The session has not loaded the image the stack is built from, so whether its dependencies are sound is what the
// panel's acquisition completes.
describe('a recipe type declaring no output, over a dependency the session has not loaded', () => {
    it('is still being resolved until its dependencies are completed', () => {
        const {recipe, output, pending} = read([STACK])

        expect(retrieveDecision({recipe, output, pending, names: ['red_1'], destination: 'GEE', task: stackTask}).status)
            .toBe('RESOLVING')
    })

    it.each([
        ['found unsound', {status: 'COMPLETE', error: null, dependencyValidity: {status: 'INVALID', diagnostics: [{code: 'MISSING_SOURCE'}]}}],
        ['not completed', {status: 'UNAVAILABLE', error: new Error('Unreachable'), dependencyValidity: null}]
    ])('exports nothing once they are %s', (_case, terminal) => {
        retrieve(read([STACK], terminal), {destination: 'GEE', bands: ['red_1']}, stackTask)

        expect(submitted).toEqual([])
    })

    it('exports once they are known to be sound', () => {
        const completed = {status: 'COMPLETE', error: null, dependencyValidity: {status: 'VALID', diagnostics: []}}

        retrieve(read([STACK], completed), {destination: 'GEE', bands: ['red_1']}, stackTask)

        expect(submitted).toHaveLength(1)
    })
})

const SOURCE = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
    }
}

const STACK = {
    id: 'stack-1',
    type: 'STACK',
    title: 'Stack',
    model: {
        inputImagery: {images: [{imageId: 'image-1', type: 'RECIPE_REF', id: SOURCE.id}]},
        bandNames: {bandNames: [{imageId: 'image-1', bands: [{originalName: 'red', outputName: 'red_1'}]}]}
    }
}

const BAYTS_HISTORICAL = {
    id: 'bayts-historical-1',
    type: 'BAYTS_HISTORICAL',
    title: 'Historical',
    model: {
        dates: {fromDate: '2020-01-01', toDate: '2021-01-01'},
        options: {orbits: ['ASCENDING']}
    }
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
