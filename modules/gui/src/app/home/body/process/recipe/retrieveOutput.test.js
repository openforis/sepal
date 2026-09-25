import {beforeEach, describe, expect, it, vi} from 'vitest'

// Retrieve over recipe types that declare no output, through their real registrations: the session's records, the
// shared graph, the common read and its legacy seam, the decision and the generic submitter. A legacy answer names
// the bands a type supplies and nothing more - its own policy applies as it always has, it restricts no destination,
// and it never stands in for dependencies not known to be sound. Only the task API and notifications are replaced;
// the terminal a Retrieve panel's acquisition would retain is supplied where a scenario needs one.

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
const {default: pyeoAlerts} = await import('./pyeoAlerts/pyeoAlerts')
const {default: baytsHistorical} = await import('./baytsHistorical/baytsHistorical')
const {retrieveTask: pyeoAlertsTask} = await import('./pyeoAlerts/pyeoAlertsRecipe')
const {retrieveTask: baytsHistoricalTask} = await import('./baytsHistorical/baytsHistoricalRecipe')
const {getAvailableBands: baytsHistoricalBands} = await import('./baytsHistorical/bands')
const {physicalRequest, readRetrieveOutput, retrieveDecision, submitRetrieve} = await import('./retrieveOutput')

addRecipeType(pyeoAlerts())
addRecipeType(baytsHistorical())

beforeEach(() => {
    submitted.length = 0
    notified.length = 0
})

describe('a recipe type declaring no output', () => {
    it('exports the bands it supplies under its own policy', () => {
        retrieve(read([PYEO_ALERTS, SOURCE]), {destination: 'GEE', bands: ['total_changes']}, pyeoAlertsTask)

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy]))
            .toEqual([[{selection: ['total_changes']}, {'.default': 'sample'}]])
    })

    it('restricts no destination, stating no physical fact about its bands', () => {
        const {recipe, output, pending} = read([PYEO_ALERTS, SOURCE])

        expect(retrieveDecision({recipe, output, pending, names: ['total_changes'], destination: 'DRIVE', task: pyeoAlertsTask}))
            .toEqual(expect.objectContaining({status: 'RETRIEVABLE', destinations: {GEE: true, DRIVE: true, SEPAL: true}}))
    })

    it('names a saved band it no longer supplies, and exports nothing', () => {
        retrieve(read([PYEO_ALERTS, SOURCE]), {destination: 'GEE', bands: ['total_changes', 'probability']}, pyeoAlertsTask)

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

// The session has not loaded the classification the alerts read, so whether its dependencies are sound is what the
// panel's acquisition completes.
describe('a recipe type declaring no output, over a dependency the session has not loaded', () => {
    it('is still being resolved until its dependencies are completed', () => {
        const {recipe, output, pending} = read([PYEO_ALERTS])

        expect(retrieveDecision({recipe, output, pending, names: ['total_changes'], destination: 'GEE', task: pyeoAlertsTask}).status)
            .toBe('RESOLVING')
    })

    it.each([
        ['found unsound', {status: 'COMPLETE', error: null, dependencyValidity: {status: 'INVALID', diagnostics: [{code: 'MISSING_SOURCE'}]}}],
        ['not completed', {status: 'UNAVAILABLE', error: new Error('Unreachable'), dependencyValidity: null}]
    ])('exports nothing once they are %s', (_case, terminal) => {
        retrieve(read([PYEO_ALERTS], terminal), {destination: 'GEE', bands: ['total_changes']}, pyeoAlertsTask)

        expect(submitted).toEqual([])
    })

    it('exports once they are known to be sound', () => {
        const completed = {status: 'COMPLETE', error: null, dependencyValidity: {status: 'VALID', diagnostics: []}}

        retrieve(read([PYEO_ALERTS], completed), {destination: 'GEE', bands: ['total_changes']}, pyeoAlertsTask)

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

const PYEO_ALERTS = {
    id: 'pyeo-alerts-1',
    type: 'PYEO_ALERTS',
    title: 'Alerts',
    model: {
        sources: {classification: SOURCE.id}
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
