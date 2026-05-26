const {of} = require('rxjs')
const {aUserChatHarness, collect} = require('../../harness')

const CONVERSATION_ID = 'conv-1'
const SUB = {clientId: 'c1', subscriptionId: 's1'}

describe('pending-action lifecycle', () => {

    it('replaces an existing pending action when a second CLARIFICATION_NEEDED arrives, emitting cleared+created', async () => {
        const harness = aHarnessClarifyingTwice()
        await collect(sendMessage(harness, 'first request'))

        const eventsSince = harness.eventsMarker()
        await collect(sendMessage(harness, 'second request'))

        const kinds = harness.eventsSince(eventsSince)
            .filter(event => event.kind?.startsWith('conversation-pending-action-'))
            .map(event => event.kind)
        expect(kinds).toEqual(['conversation-pending-action-cleared', 'conversation-pending-action-created'])
        expect(harness.pendingActions.get(CONVERSATION_ID)).toMatchObject({id: 'pa-2'})
    })

    it('clears the pending action when the conversation is deleted', async () => {
        const harness = aHarnessThatClarifies()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))
        expect(harness.pendingActions.get(CONVERSATION_ID)).toMatchObject({id: 'pa-1'})

        await collect(harness.handle$({type: 'delete-conversation', conversationId: CONVERSATION_ID}))

        expect(harness.pendingActions.get(CONVERSATION_ID)).toBeUndefined()
    })

    it('does not project pending-action state into the LLM message view', async () => {
        const harness = aHarnessThatClarifies()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))
        const llmCallsAtClarification = harness.llm.receivedMessages.length

        await collect(sendMessage(harness, 'unrelated follow-up'))

        const lastLlmMessages = harness.llm.receivedMessages[harness.llm.receivedMessages.length - 1]
        const serialised = JSON.stringify(lastLlmMessages)
        expect(serialised).not.toMatch(/conversation-pending-action/)
        expect(serialised).not.toMatch(/PENDING_ACTION/)
        expect(harness.llm.receivedMessages.length).toBeGreaterThan(llmCallsAtClarification)
    })
})

function aHarnessThatClarifies() {
    const updateRecipe = {
        name: 'update_recipe',
        description: 'Update.',
        directAnswer: true,
        parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}},
        invoke$: () => of({ok: false, error: {code: 'CLARIFICATION_NEEDED', answer: 'Do you want to add Sentinel-2 to this recipe?'}})
    }
    const harness = aUserChatHarness({
        replies: [
            {toolCalls: [{id: 'tc-1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'Use Cloud Score+ instead'}}]},
            {text: 'orchestrator follow-up text after the unrelated message'}
        ],
        tools: [updateRecipe]
    })
    harness.handle$({type: 'create-conversation'}).subscribe()
    return harness
}

function aHarnessClarifyingTwice() {
    let updateCalls = 0
    const questions = ['Question one?', 'Question two?']
    const updateRecipe = {
        name: 'update_recipe',
        description: 'Update.',
        directAnswer: true,
        parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}},
        invoke$: () => {
            const q = questions[updateCalls++] || 'fallback?'
            return of({ok: false, error: {code: 'CLARIFICATION_NEEDED', answer: q}})
        }
    }
    const harness = aUserChatHarness({
        replies: [
            {toolCalls: [{id: 'tc-1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'first'}}]},
            {toolCalls: [{id: 'tc-2', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'second'}}]}
        ],
        tools: [updateRecipe]
    })
    harness.handle$({type: 'create-conversation'}).subscribe()
    return harness
}

function sendMessage(harness, text) {
    return harness.handle$({type: 'message', conversationId: CONVERSATION_ID, text, ...SUB})
}
