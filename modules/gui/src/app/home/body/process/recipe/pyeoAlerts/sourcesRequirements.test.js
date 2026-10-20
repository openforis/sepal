import {describe, expect, it, vi} from 'vitest'

// PyEO Alerts through its real registration and the shared reads: what its Sources lack marks SRC, naming the setting,
// and holds back previews and Retrieve, here and in a Masking of it, until it is configured.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/apiRegistry', () => ({default: {}}))

const {addRecipeType} = await import('../../recipeTypeRegistry')
const {default: pyeoAlerts} = await import('./pyeoAlerts')
const {default: masking} = await import('../masking/masking')
const {requestGate} = await import('../sourceRequirements')
const {sourceProblemsOfState} = await import('../selectedSourceStatus')
const {retrieveAvailability} = await import('../operationAvailability')

addRecipeType(pyeoAlerts())
addRecipeType(masking())

describe('a PyEO Alerts whose Sources lack what it detects change with', () => {
    it.each([
        ['no classification', {classification: undefined}, 'classification'],
        ['no class to detect change from', {changeFromClasses: []}, 'changeFromClasses'],
        ['no class to detect change to', {changeToClasses: []}, 'changeToClasses']
    ])('with %s marks SRC, naming that setting, and holds back previews and Retrieve', (_case, sources, field) => {
        const recipe = pyeoOf(sources)
        const state = stateOf(recipe)

        expect(sourceProblemsOfState(state, recipe.id, undefined, Date.now(), NOTHING_HELD))
            .toEqual({sources: `process.pyeoAlerts.panel.sources.form.${field}.required`})
        expect(requestGate({state, recipe, operation: 'IMAGE_OUTPUT', heldFor: NOTHING_HELD}))
            .toMatchObject({withdraw: true, section: SOURCES_SECTION})
        expect(retrieveAvailability({state, recipe, heldFor: NOTHING_HELD}).available).toBe(false)
    })

    it('holds back a Masking of it, and neither once its Sources are configured', () => {
        const over = {id: 'masking-1', type: 'MASKING', model: {
            imageToMask: {type: 'RECIPE_REF', id: PYEO}, imageMask: {type: 'RECIPE_REF', id: PYEO}
        }}
        const missing = stateOf(over, pyeoOf({changeToClasses: []}))
        const repaired = stateOf(over, pyeoOf())

        expect(requestGate({state: missing, recipe: over, operation: 'IMAGE_OUTPUT', heldFor: NOTHING_HELD})).toMatchObject({withdraw: true})
        expect(retrieveAvailability({state: missing, recipe: over, heldFor: NOTHING_HELD}).available).toBe(false)
        expect(sourceProblemsOfState(repaired, PYEO, undefined, Date.now(), NOTHING_HELD)).toEqual({})
        expect(requestGate({state: repaired, recipe: over, operation: 'IMAGE_OUTPUT', heldFor: NOTHING_HELD})).toBeNull()
        expect(retrieveAvailability({state: repaired, recipe: over, heldFor: NOTHING_HELD}).available).toBe(true)
    })
})

// Monitoring scenes must carry what the Classification's classifier reads; an enabled gate's index must be computable.
describe('a PyEO Alerts whose monitoring data cannot feed its classifier', () => {
    it('marks SRC at the classification where no supported monitoring data could, holding back previews and Retrieve', () => {
        const recipe = pyeoOf({dataSets: {LANDSAT: ['LANDSAT_9']}})
        const state = stateOf(recipe, classificationOver(['VV_mean', 'VH_med']))

        expect(sourceProblemsOfState(state, recipe.id, undefined, Date.now(), NOTHING_HELD))
            .toEqual({sources: expect.stringContaining('process.pyeoAlerts.panel.sources.form.classification.unsuppliedInputs')})
        expect(requestGate({state, recipe, operation: 'IMAGE_OUTPUT', heldFor: NOTHING_HELD})).toMatchObject({withdraw: true, section: SOURCES_SECTION})
        expect(retrieveAvailability({state, recipe, heldFor: NOTHING_HELD}).available).toBe(false)
    })

    it('marks SRC at the data sets where other supported monitoring data could, and nothing once they do', () => {
        const needing = pyeoOf({dataSets: {LANDSAT: ['LANDSAT_9']}})
        const repaired = pyeoOf({dataSets: {SENTINEL_2: ['SENTINEL_2']}})
        const classification = classificationOver(['red', 'nir', 'redEdge1'])

        expect(sourceProblemsOfState(stateOf(needing, classification), PYEO, undefined, Date.now(), NOTHING_HELD))
            .toEqual({sources: expect.stringContaining('process.pyeoAlerts.panel.sources.form.dataSets.unsuppliedInputs')})
        expect(sourceProblemsOfState(stateOf(repaired, classification), PYEO, undefined, Date.now(), NOTHING_HELD)).toEqual({})
    })

    it('marks OPT where the monitoring data cannot compute the gate\'s index', () => {
        const recipe = pyeoOf({dataSets: {SENTINEL_2: ['SENTINEL_2']}}, {index: 'ebbi', threshold: 0.2})
        const state = stateOf(recipe, classificationOver(['red', 'nir']))

        expect(sourceProblemsOfState(state, recipe.id, undefined, Date.now(), NOTHING_HELD))
            .toEqual({pyeoAlertsOptions: expect.stringContaining('process.pyeoAlerts.panel.options.form.gateIndex.unavailable.MONITORING')})
        expect(requestGate({state, recipe, operation: 'IMAGE_OUTPUT', heldFor: NOTHING_HELD})).toMatchObject({withdraw: true})
    })

    it('marks nothing over optical inputs the monitoring data supplies', () => {
        const recipe = pyeoOf({dataSets: {LANDSAT: ['LANDSAT_9']}})
        const state = stateOf(recipe, classificationOver(['red', 'nir', 'swir1', 'ndvi']))

        expect(sourceProblemsOfState(state, recipe.id, undefined, Date.now(), NOTHING_HELD)).toEqual({})
        expect(requestGate({state, recipe, operation: 'IMAGE_OUTPUT', heldFor: NOTHING_HELD})).toBeNull()
    })
})

const PYEO = 'pyeo-1'
const CLASSIFICATION = 'classification-1'
const SOURCES_SECTION = 'process.pyeoAlerts.panel.sources.button'
const NOTHING_HELD = () => null

const pyeoOf = (sources, indexGate) => ({
    id: PYEO,
    type: 'PYEO_ALERTS',
    title: 'Alerts',
    model: {
        dates: {monitoringStart: '2024-01-01', monitoringEnd: '2024-06-01'},
        sources: {classification: CLASSIFICATION, dataSets: {SENTINEL_2: ['SENTINEL_2']}, changeFromClasses: [1], changeToClasses: [2], ...sources},
        options: {corrections: ['SR']},
        pyeoAlertsOptions: {minConsecutiveDetections: 2, ...(indexGate && {indexGate})}
    }
})

const CLASSIFICATION_RECORD = {id: CLASSIFICATION, type: 'CLASSIFICATION', model: {}}

// A Classification over an asset, its classifier reading the features given.
const classificationOver = included => ({...CLASSIFICATION_RECORD, model: {
    inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]}
}})

const stateOf = (recipe, ...records) => {
    const all = [recipe, ...records, ...records.some(({id}) => id === CLASSIFICATION) ? [] : [CLASSIFICATION_RECORD]]
    return {
        process: {
            loadedRecipes: Object.fromEntries(all.map(record => [record.id, record])),
            recipes: all.map(({id}) => ({id, revision: 1})),
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            tabs: []
        }
    }
}
