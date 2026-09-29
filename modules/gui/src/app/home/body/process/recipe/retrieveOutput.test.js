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
const {default: timeSeries} = await import('./timeSeries/timeSeries')
const {getAvailableBands: timeSeriesBands} = await import('./timeSeries/bands')
const {physicalRequest, readRetrieveOutput, retrieveDecision, submitRetrieve} = await import('./retrieveOutput')

addRecipeType(timeSeries())

beforeEach(() => {
    submitted.length = 0
    notified.length = 0
})

describe('a recipe type declaring no output', () => {
    it('exports the bands it supplies with no policy, leaving Earth Engine\'s own default to apply', () => {
        retrieve(read([TIME_SERIES]), {destination: 'GEE', bands: ['count']})

        expect(submitted.map(({params: {image}}) => image.bands)).toEqual([{selection: ['count']}])
        expect(submitted[0].params.image).not.toHaveProperty('pyramidingPolicy')
    })

    it('restricts no destination, stating no physical fact about its bands', () => {
        const {recipe, output, pending} = read([TIME_SERIES])

        expect(retrieveDecision({recipe, output, pending, names: ['count'], destination: 'DRIVE'}))
            .toEqual(expect.objectContaining({status: 'RETRIEVABLE', destinations: {GEE: true, DRIVE: true, SEPAL: true}}))
    })

    it('names a saved band it does not supply, and exports nothing', () => {
        retrieve(read([TIME_SERIES]), {destination: 'GEE', bands: ['count', 'observations']})

        expect(submitted).toEqual([])
        expect(notified).toHaveLength(1)
    })
})

describe('"all bands" of a recipe type declaring no output', () => {
    it('exports every band the type supplies', () => {
        retrieve(read([TIME_SERIES]), {destination: 'GEE', useAllBands: true})

        expect(submitted[0].params.image.bands.selection).toEqual(Object.keys(timeSeriesBands(TIME_SERIES)))
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

// A type with no Retrieve panel of its own, so nothing here names a task; its legacy entry supplies `count`.
const TIME_SERIES = {
    id: 'time-series-1',
    type: 'TIME_SERIES',
    title: 'Observations',
    model: {dates: {startDate: '2020-01-01', endDate: '2021-01-01'}}
}

const OVER_UNLOADED_AOI = {
    ...TIME_SERIES,
    model: {...TIME_SERIES.model, aoi: {type: 'RECIPE', id: 'aoi-recipe-1'}}
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
