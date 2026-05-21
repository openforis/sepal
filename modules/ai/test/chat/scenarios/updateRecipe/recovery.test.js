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

        // The transient stall nudge anchors a silent round's retry prompt only.
        // It must never leak into the accumulating dialogue, or every later round
        // would carry it and the specialist would re-read a fabricated user turn.
        it('keeps the transient stall nudge out of the persisted history of later rounds', () => {
            const isStallNudge = message => /Continue working on the original request/.test(message.content || '')
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

            harness.invoke({recipeId: 'r1', instruction: 'edit'})

            const [, stallRound, postPatchRound] = harness.llm.receivedMessages
            expect(stallRound.some(isStallNudge)).toBe(true)
            expect(postPatchRound.some(isStallNudge)).toBe(false)
        })
    })

    describe('no-patch corrective nudge', () => {

        const prepareCall = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: ['/dates/targetDate']}}
        const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
            recipeId: 'r1', baseModelHash: 'h1',
            operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}]
        }}

        // The nudge persists in the accumulating message history, so count the
        // calls it TRIGGERED — those whose final message is the nudge — not every
        // call that still carries it.
        function nudgeCount(harness) {
            return harness.llm.receivedMessages.filter(messages => {
                const last = messages[messages.length - 1]
                return last && /did not call recipe_patch/i.test(last.content || '')
            }).length
        }

        it('nudges once when the specialist prepares then answers with prose, and accepts a following recipe_patch', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {toolCalls: [prepareCall]},
                    {text: 'This would change the season window.'},
                    {toolCalls: [patchCall]},
                    {text: 'Patched the season end.'}
                ]
            })

            const result = harness.invoke({recipeId: 'r1', instruction: 'set season end to 2026-06-01'})

            expect(result).toEqual({ok: true, data: {answer: 'Patched the season end.'}})
            expect(nudgeCount(harness)).toBe(1)
            const noProgress = harness.bus.events.filter(event => event.type === 'specialist.noProgress')
            expect(noProgress).toHaveLength(1)
            expect(noProgress[0]).toMatchObject({name: 'recipe.update', level: 'warn', reason: 'no-progress-nudge'})
        })

        it('nudges at most once — a second no-patch prose response returns UPDATE_NOT_ATTEMPTED', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {toolCalls: [prepareCall]},
                    {text: 'Here is what it would do.'},
                    {text: 'Still just explaining, no patch.'}
                ]
            })

            const result = harness.invoke({recipeId: 'r1', instruction: 'set season end to 2026-06-01'})

            expect(result).toMatchObject({ok: false, error: {code: 'UPDATE_NOT_ATTEMPTED'}})
            expect(nudgeCount(harness)).toBe(1)
        })

        it('does not nudge when the specialist never prepared an edit (nudge is prepare-then-no-patch only)', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [{text: 'I cannot do that.'}]
            })

            const result = harness.invoke({recipeId: 'r1', instruction: 'do something impossible'})

            expect(result).toMatchObject({ok: false, error: {code: 'UPDATE_NOT_ATTEMPTED'}})
            expect(nudgeCount(harness)).toBe(0)
            expect(harness.llm.receivedMessages).toHaveLength(1)
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
