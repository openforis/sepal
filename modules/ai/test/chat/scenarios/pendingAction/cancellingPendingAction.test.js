const {of} = require('rxjs')
const {aUserChatHarness, collect} = require('../../harness')

const CONVERSATION_ID = 'conv-1'
const SUB = {clientId: 'c1', subscriptionId: 's1'}
const QUESTION = 'Do you want to add Sentinel-2 to this recipe?'

describe('cancelling a pending action', () => {

    it('clears the pending action and emits a cancelled event', async () => {
        const harness = aHarnessThatClarifies()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))

        const eventsSince = harness.eventsMarker()
        await collect(cancelPendingAction(harness, 'pa-1'))

        expect(harness.pendingActions.get(CONVERSATION_ID)).toBeUndefined()
        expect(harness.eventsSince(eventsSince)).toEqual([{
            kind: 'conversation-pending-action-cleared',
            targeting: 'broadcast',
            payload: {conversationId: CONVERSATION_ID, pendingActionId: 'pa-1', reason: 'cancelled'}
        }])
    })

    it('does not invoke the LLM or any tool', async () => {
        const harness = aHarnessThatClarifies()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))
        const llmCallsBefore = harness.llm.receivedMessages.length
        const toolCallsBefore = harness.invocations.length

        await collect(cancelPendingAction(harness, 'pa-1'))

        expect(harness.llm.receivedMessages).toHaveLength(llmCallsBefore)
        expect(harness.invocations).toHaveLength(toolCallsBefore)
    })

    it('rejects a mismatched id with pending-action-error and leaves the active pending in place', async () => {
        const harness = aHarnessThatClarifies()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))

        const eventsSince = harness.eventsMarker()
        await collect(cancelPendingAction(harness, 'wrong-id'))

        expect(harness.pendingActions.get(CONVERSATION_ID)).toMatchObject({id: 'pa-1'})
        expect(harness.eventsSince(eventsSince)).toEqual([{
            kind: 'pending-action-error',
            targeting: 'targeted',
            payload: {conversationId: CONVERSATION_ID, pendingActionId: 'wrong-id', code: 'PENDING_ACTION_NOT_FOUND', message: expect.any(String)}
        }])
    })
})

function aHarnessThatClarifies() {
    const updateRecipe = {
        name: 'update_recipe',
        description: 'Update.',
        directAnswer: true,
        parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}},
        invoke$: () => of({ok: false, error: {code: 'CLARIFICATION_NEEDED', answer: QUESTION}})
    }
    const harness = aUserChatHarness({
        replies: [
            {toolCalls: [{id: 'tc-1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'Use Cloud Score+ instead'}}]}
        ],
        tools: [updateRecipe]
    })
    harness.handle$({type: 'create-conversation'}).subscribe()
    return harness
}

function sendMessage(harness, text) {
    return harness.handle$({type: 'message', conversationId: CONVERSATION_ID, text, ...SUB})
}

function cancelPendingAction(harness, pendingActionId) {
    return harness.handle$({type: 'cancel-pending-action', conversationId: CONVERSATION_ID, pendingActionId})
}
