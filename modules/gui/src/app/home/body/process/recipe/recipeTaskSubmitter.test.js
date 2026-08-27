import {describe, expect, it, vi} from 'vitest'

// The generic Retrieve submitter, exercised directly. Only its boundaries are replaced - the task API, the
// recipe-type registry, the task-info builder, visualizations, translations and analytics - so what runs is
// the submitter's own logic.
//
// Nothing is rendered and no component is mounted or inspected.
//
// A synthetic recipe type rather than a real one: what is under test is what the submitter does when a type
// declares a date-range provider, declares one that answers nothing, or declares none at all. Naming a real
// recipe would tie these witnesses to whatever that recipe happens to provide today.

const state = vi.hoisted(() => ({
    submitted: [],
    recipeType: null,
    events: []
}))

vi.mock('~/apiRegistry', () => ({
    default: {
        tasks: {
            submit$: task => {
                state.submitted.push(task)
                return {subscribe: () => ({unsubscribe: () => {}})}
            }
        }
    }
}))

vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: () => state.recipeType
}))

vi.mock('~/app/home/body/process/recipe/recipeOutputPath', () => ({
    getTaskInfo: () => ({outputPath: 'some/output/path'})
}))

vi.mock('~/app/home/body/process/recipe/visualizations', () => ({
    getAllVisualizations: () => []
}))

vi.mock('~/eventPublisher', () => ({
    publishEvent: (event, props) => state.events.push({event, props})
}))

vi.mock('~/translate', () => ({
    msg: key => (Array.isArray(key) ? key.join('.') : key)
}))

const {submitRetrieveRecipeTask} = await import('./recipeTaskSubmitter')

const recipe = () => ({
    id: 'recipe-1',
    projectId: 'project-1',
    type: 'SYNTHETIC',
    title: 'A synthetic recipe',
    model: {dates: {startDate: '2020-01-01'}},
    ui: {retrieveOptions: {destination: 'GEE', bands: ['band-1']}}
})

const submit = (recipeType, config) => {
    state.submitted = []
    state.events = []
    state.recipeType = recipeType
    submitRetrieveRecipeTask(recipe(), config)
    return state.submitted
}

const propertiesOf = ([task]) => task.params.image.properties

// A value the submitter is expected to reduce through valueOf(), like the moment instances real providers
// return - so a witness can tell "the range was read" from "the range object was passed through".
const instant = millis => ({valueOf: () => millis})

describe('submitRetrieveRecipeTask', () => {
    // The defect. A recipe type that declares no date-range provider is a legitimate type - Masking is one -
    // and Retrieve calls the provider unconditionally, so submitting one throws before a task is ever built.
    it('submits a recipe type that declares no date range', () => {
        const submitted = submit({id: 'SYNTHETIC'})
        expect(submitted).toHaveLength(1)
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_start')
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_end')
    })

    // The reason the fix cannot be optional chaining all the way down. Only the PROVIDER is optional: a type
    // the registry does not know is not a type that declares no date range, and guarding the lookup as well
    // would make the two indistinguishable.
    //
    // Scoped to the path that asks for time metadata. With includeTimeRange false the submitter never
    // consults the registry at all, so an unregistered type still submits - existing behavior, outside this
    // packet, and deliberately left unpinned.
    it('does not treat an unregistered type as one without a date-range provider', () => {
        expect(() => submit(undefined)).toThrow()
        expect(state.submitted).toHaveLength(0)
    })

    // Compatibility: a type that does provide a range keeps writing it, reduced through valueOf, and the
    // provider is given the recipe to derive it from.
    it('writes the range a provider returns', () => {
        const getDateRange = vi.fn(() => [instant(1000), instant(2000)])
        const submitted = submit({id: 'SYNTHETIC', getDateRange})

        expect(getDateRange).toHaveBeenCalledTimes(1)
        expect(getDateRange.mock.calls[0][0]).toMatchObject({id: 'recipe-1', type: 'SYNTHETIC'})
        expect(propertiesOf(submitted)['system:time_start']).toBe(1000)
        expect(propertiesOf(submitted)['system:time_end']).toBe(2000)
    })

    // A provider that has nothing to say is not an error. A recipe can be configured such that no range is
    // derivable yet, and the export is still valid without the two properties.
    it.each([
        ['undefined', undefined],
        ['null', null],
        ['an empty range', []]
    ])('omits both properties when the provider returns %s', (_name, range) => {
        const submitted = submit({id: 'SYNTHETIC', getDateRange: () => range})
        expect(submitted).toHaveLength(1)
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_start')
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_end')
    })

    // Callers that opt out must not pay for the provider at all: asking a recipe for a range it was told not
    // to include is work at best and a crash at worst.
    it('never asks for a range when the caller opted out', () => {
        const getDateRange = vi.fn(() => [instant(1000), instant(2000)])
        const submitted = submit({id: 'SYNTHETIC', getDateRange}, {includeTimeRange: false})

        expect(getDateRange).not.toHaveBeenCalled()
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_start')
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_end')
    })
})
