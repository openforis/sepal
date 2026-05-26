const {of} = require('rxjs')
const {aUserChatHarness, collect, eventsOfKind} = require('../../harness')

const CONVERSATION_ID = 'conv-1'
const SUB = {clientId: 'c1', subscriptionId: 's1'}
const QUESTION = 'Do you want to add Sentinel-2 to this recipe?'

describe('select-conversation surfaces any active pending action to the selecting client', () => {

    it('emits conversation-pending-action-created right after conversation-loaded when a pending action is active', async () => {
        const harness = aHarnessThatClarifies()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))

        const marker = harness.eventsMarker()
        await collect(harness.handle$({type: 'select-conversation', conversationId: CONVERSATION_ID}))

        const kinds = harness.eventsSince(marker).map(event => event.kind)
        expect(kinds).toEqual(['conversation-loaded', 'conversation-pending-action-created'])
    })

    it('targets the rediscovered pending-action event to the selecting subscription (not broadcast to every tab of the user)', async () => {
        const harness = aHarnessThatClarifies()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))

        const marker = harness.eventsMarker()
        await collect(harness.handle$({type: 'select-conversation', conversationId: CONVERSATION_ID}))

        const created = eventsOfKind(harness.eventsSince(marker), 'conversation-pending-action-created')[0]
        expect(created.targeting).toBe('targeted')
    })

    it('projects only the client-safe fields (id, toolName, question)', async () => {
        const harness = aHarnessThatClarifies()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))

        const marker = harness.eventsMarker()
        await collect(harness.handle$({type: 'select-conversation', conversationId: CONVERSATION_ID}))

        const created = eventsOfKind(harness.eventsSince(marker), 'conversation-pending-action-created')[0]
        expect(Object.keys(created.payload.pendingAction).sort()).toEqual(['id', 'question', 'toolName'])
        expect(created.payload.pendingAction).toEqual({
            id: 'pa-1', toolName: 'update_recipe', question: QUESTION
        })
    })

    it('emits no pending-action event when no pending action is active for the selected conversation', async () => {
        const harness = aHarnessWithPlainTextReply()
        await collect(sendMessage(harness, 'hello'))

        const marker = harness.eventsMarker()
        await collect(harness.handle$({type: 'select-conversation', conversationId: CONVERSATION_ID}))

        expect(eventsOfKind(harness.eventsSince(marker), 'conversation-pending-action-created')).toEqual([])
    })

    it('does not surface stale pending-action state on a different conversation after the original was deleted', async () => {
        const harness = aHarnessThatClarifies({conversationIds: ['conv-1', 'conv-2']})
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))
        await collect(harness.handle$({type: 'delete-conversation', conversationId: CONVERSATION_ID}))
        await collect(harness.handle$({type: 'create-conversation'}))

        const marker = harness.eventsMarker()
        await collect(harness.handle$({type: 'select-conversation', conversationId: 'conv-2'}))

        expect(eventsOfKind(harness.eventsSince(marker), 'conversation-pending-action-created')).toEqual([])
    })
})

function aHarnessThatClarifies({conversationIds = ['conv-1']} = {}) {
    const updateRecipe = {
        name: 'update_recipe',
        description: 'Update.',
        directAnswer: true,
        parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}},
        invoke$: () => of({ok: false, error: {code: 'CLARIFICATION_NEEDED', answer: QUESTION}})
    }
    const harness = aUserChatHarness({
        conversationIds,
        replies: [
            {toolCalls: [{id: 'tc-1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'Use Cloud Score+ instead'}}]}
        ],
        tools: [updateRecipe]
    })
    harness.handle$({type: 'create-conversation'}).subscribe()
    return harness
}

function aHarnessWithPlainTextReply() {
    const harness = aUserChatHarness({
        replies: [{text: 'Hello back.'}]
    })
    harness.handle$({type: 'create-conversation'}).subscribe()
    return harness
}

function sendMessage(harness, text) {
    return harness.handle$({type: 'message', conversationId: CONVERSATION_ID, text, ...SUB})
}
