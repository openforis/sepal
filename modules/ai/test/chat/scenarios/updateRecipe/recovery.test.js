import {of} from 'rxjs'

import {aToolFactoryHarness} from '../../harness.js'

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

        it('publishes a single outcome event with code=CLARIFICATION_NEEDED when the updater asked for more info instead of calling update_recipe_values', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {text: '{"handles":["targetDate"]}'},
                    {text: 'Which date should I use as the new target?'}
                ]
            })

            harness.invoke({recipeId: 'r1', instruction: 'shift the target date'})

            const outcomes = harness.bus.events.filter(event => event.type === 'update_recipe.outcome')
            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({
                code: 'CLARIFICATION_NEEDED',
                patchAttempted: false,
                patchSucceeded: false,
                answerChars: 'Which date should I use as the new target?'.length
            })
        })
    })

    // Reference of() to suppress unused-import warning; kept available for tests
    // that need to script GUI handlers inline.
    void of
})
