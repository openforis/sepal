const {of} = require('rxjs')
const {aToolFactoryHarness} = require('../../harness')

describe('update_recipe recovery and observability', () => {

    describe('regressions and recovery', () => {

        it('returns a single clean answer on the happy path', () => {
            const updateCall = {id: 'tu1', name: 'update_recipe_values', input: {
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['targetDate', 'seasonStart', 'seasonEnd'],
                values: {targetDate: '2023-07-02'}
            }}
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {text: '{"handles":["targetDate"]}'},
                    {toolCalls: [updateCall]},
                    {text: 'Done.'}
                ]
            })

            const result = harness.invoke({recipeId: 'r1', instruction: 'change target date'})

            expect(result).toEqual({ok: true, data: {answer: 'Done.'}})
        })

        it('still returns an answer when the updater emits an empty round before a useful one (stall recovery)', () => {
            const updateCall = {id: 'tu1', name: 'update_recipe_values', input: {
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['targetDate', 'seasonStart', 'seasonEnd'],
                values: {targetDate: '2023-07-02'}
            }}
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {text: '{"handles":["targetDate"]}'},
                    {text: ''},
                    {toolCalls: [updateCall]},
                    {text: 'Recovered and updated.'}
                ]
            })

            const result = harness.invoke({recipeId: 'r1', instruction: 'change target date'})

            expect(result).toEqual({ok: true, data: {answer: 'Recovered and updated.'}})
        })
    })

    describe('update_recipe.outcome bus event', () => {

        it('publishes a single outcome event with code=ok on the happy path', () => {
            const updateCall = {id: 'tu1', name: 'update_recipe_values', input: {
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['targetDate', 'seasonStart', 'seasonEnd'],
                values: {targetDate: '2023-07-02'}
            }}
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {text: '{"handles":["targetDate"]}'},
                    {toolCalls: [updateCall]},
                    {text: 'Target date set.'}
                ]
            })

            harness.invoke({recipeId: 'r1', instruction: 'shift target date'})

            const outcomes = harness.bus.events.filter(event => event.type === 'update_recipe.outcome')
            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({type: 'update_recipe.outcome', code: 'ok'})
        })

        it('publishes a single outcome event with the failure code when the updater never called update_recipe_values', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {text: '{"handles":["targetDate"]}'},
                    {text: 'I could not satisfy that.'}
                ]
            })

            harness.invoke({recipeId: 'r1', instruction: 'do something impossible'})

            const outcomes = harness.bus.events.filter(event => event.type === 'update_recipe.outcome')
            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({code: 'UPDATE_NOT_ATTEMPTED', patchAttempted: false, patchSucceeded: false})
        })
    })

    // Reference of() to suppress unused-import warning; kept available for tests
    // that need to script GUI handlers inline.
    void of
})
