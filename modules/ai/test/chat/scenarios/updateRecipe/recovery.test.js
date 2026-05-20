const {concat, of} = require('rxjs')
const {emitChannel, guiAction} = require('#mcp/chat/channelEvents')
const {aToolFactoryHarness, aFakeGuiRequests} = require('../../harness')
const {mosaicMetadata} = require('./fixtures')

describe('update_recipe recovery and observability', () => {

    describe('regressions and recovery', () => {

        it('returns a single clean answer when the metadata lookup interleaves a channel event before the data', () => {
            const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h1',
                operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}]
            }}
            const guiRequests = aFakeGuiRequests(() => concat(
                of(emitChannel(guiAction({requestId: 'req-1', action: 'recipe-metadata', params: {recipeId: 'r1'}}))),
                of(mosaicMetadata)
            ))
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                guiRequests,
                replies: [
                    {toolCalls: [patchCall]},
                    {text: 'Done.'}
                ]
            })

            const result = harness.invoke({recipeId: 'r1', instruction: 'change'})

            expect(result).toEqual({ok: true, data: {answer: 'Done.'}})
        })

        it('still returns an answer when the inner specialist emits an empty round before a useful one (stall recovery)', () => {
            const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h1',
                operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}]
            }}
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {text: ''},
                    {toolCalls: [patchCall]},
                    {text: 'Recovered and patched.'}
                ]
            })

            const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

            expect(result).toEqual({ok: true, data: {answer: 'Recovered and patched.'}})
        })
    })

    describe('update_recipe.outcome bus event', () => {

        it('publishes a single outcome event with code=ok on the happy path (consumer-load-bearing for logListener routing)', () => {
            const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h1',
                operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}]
            }}
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {toolCalls: [patchCall]},
                    {text: 'Season end set.'}
                ]
            })

            harness.invoke({recipeId: 'r1', instruction: 'edit'})

            const outcomes = harness.bus.events.filter(event => event.type === 'update_recipe.outcome')
            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({type: 'update_recipe.outcome', code: 'ok'})
        })
    })
})
