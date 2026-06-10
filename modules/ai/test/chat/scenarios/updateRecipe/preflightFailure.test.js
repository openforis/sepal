import {throwError} from 'rxjs'

import {aConversationHarness, aFakeGuiRequests, aToolFactoryHarness, collect} from '../../harness.js'

// When the recipe can't be resolved at preflight, update_recipe is a directAnswer
// tool returning ok:false. It must carry a user-facing error.answer so the
// orchestrator streams the failure straight to the user instead of attempting a
// restate round (which went empty then silent in the live failure).
describe('update_recipe preflight failure surfaces a user-facing answer', () => {

    function notFoundGui() {
        return aFakeGuiRequests(() => throwError(() => Object.assign(new Error('Recipe not found: r1'), {code: 'RECIPE_NOT_FOUND'})))
    }

    it('returns ok:false with the raw code and a user-facing error.answer', () => {
        const harness = aToolFactoryHarness({specialist: 'update_recipe', guiRequests: notFoundGui()})

        const result = harness.invoke({recipeId: 'r1', instruction: 'change season end'})

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('RECIPE_NOT_FOUND')
        expect(result.error.answer).toMatch(/couldn't find the recipe to update/i)
    })

    it('uses a transient try-again answer for a non-not-found preflight error, keeping the raw code/message', () => {
        const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('bridge down')))
        const harness = aToolFactoryHarness({specialist: 'update_recipe', guiRequests})

        const result = harness.invoke({recipeId: 'r1', instruction: 'change season end'})

        expect(result.error.code).toBe('TOOL_FAILED')
        expect(result.error.message).toBe('bridge down')
        expect(result.error.answer).toMatch(/try again/i)
        expect(result.error.answer).not.toMatch(/closed, deleted/i)
    })

    it('still publishes the update_recipe.outcome diagnostic on preflight failure, with answerChars matching the surfaced answer', () => {
        const harness = aToolFactoryHarness({specialist: 'update_recipe', guiRequests: notFoundGui()})

        const result = harness.invoke({recipeId: 'r1', instruction: 'change season end'})

        const outcomes = harness.bus.events.filter(event => event.type === 'update_recipe.outcome')
        expect(outcomes).toHaveLength(1)
        expect(outcomes[0]).toMatchObject({patchAttempted: false, code: 'RECIPE_NOT_FOUND'})
        expect(outcomes[0].answerChars).toBe(result.error.answer.length)
    })

    describe('routed through the orchestrator', () => {
        const updateCall = {id: 'u1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'change season end'}}
        const toolContext = {conversationId: 'conv-1', clientId: 'c1', subscriptionId: 's1'}

        function aConversationOverFailingPreflight() {
            const tool = aToolFactoryHarness({specialist: 'update_recipe', guiRequests: notFoundGui()}).tool
            return aConversationHarness({
                replies: [{toolCalls: [updateCall]}, {text: 'orchestrator restate that should never run'}],
                tools: [tool]
            })
        }

        it('streams the preflight failure answer to the channel', async () => {
            const conversation = aConversationOverFailingPreflight()

            const events = await collect(conversation.send$('change season end', {toolContext}))

            const text = events.filter(event => event.textDelta).map(event => event.textDelta).join('')
            expect(text).toMatch(/couldn't find the recipe to update/i)
        })

        it('asks the orchestrator LLM only once — no restate round', async () => {
            const conversation = aConversationOverFailingPreflight()

            await collect(conversation.send$('change season end', {toolContext}))

            expect(conversation.llm.receivedMessages).toHaveLength(1)
        })
    })
})
