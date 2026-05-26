const {of} = require('rxjs')
const {createPendingActions} = require('#mcp/chat/conversation/pendingActions')
const {isChannelEmission} = require('#mcp/chat/channelEvents')
const {aConversationHarness, collect} = require('../../harness')

const QUESTION = 'Do you want to add Sentinel-2 to this recipe?'

describe('a CLARIFICATION_NEEDED tool result records a pending action and surfaces it on the channel', () => {

    it('streams the directAnswer question text to the user and emits a conversation-pending-action-created channel event in the same turn', async () => {
        const {send$} = aHarnessThatClarifies()

        const turnEvents = await collect(send$('use Cloud Score+ instead'))

        expect(textOf(turnEvents)).toContain(QUESTION)
        expect(pendingCreatedIn(turnEvents).payload.pendingAction).toMatchObject({
            id: 'pa-1', toolName: 'update_recipe', question: QUESTION
        })
    })

    it('records the pending action in the shared store, keyed by conversationId', async () => {
        const harness = aHarnessThatClarifies()

        await collect(harness.send$('use Cloud Score+ instead'))

        expect(harness.pendingActions.get('conv-1')).toMatchObject({
            toolName: 'update_recipe',
            args: {recipeId: 'r1', instruction: 'use Cloud Score+ instead'},
            question: QUESTION
        })
    })

    it('does not record a pending action when the tool result is a success', async () => {
        const harness = aHarnessThatClarifies({clarification: {ok: true, data: {answer: 'Updated.'}}})

        const turnEvents = await collect(harness.send$('change something'))

        expect(harness.pendingActions.get('conv-1')).toBeUndefined()
        expect(pendingCreatedIn(turnEvents)).toBeUndefined()
    })
})

function aHarnessThatClarifies({clarification = aClarificationResult()} = {}) {
    const tool = {
        name: 'update_recipe',
        description: 'Update.',
        directAnswer: true,
        parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}},
        invoke$: () => of(clarification)
    }
    const conversations = aFakeConversations()
    const pendingActions = createPendingActions({
        conversations,
        createId: counter('pa-'),
        clock: {nowIso: () => '2026-05-26T10:00:00.000Z'}
    })
    const harness = aConversationHarness({
        replies: [
            {toolCalls: [anUpdateRecipeCall()]},
            {text: 'orchestrator restate that should not run'}
        ],
        tools: [tool],
        pendingActions
    })
    conversations.attach(harness.conversation)
    return {...harness, pendingActions, conversations}
}

function aClarificationResult() {
    return {ok: false, error: {code: 'CLARIFICATION_NEEDED', answer: QUESTION}}
}

function anUpdateRecipeCall() {
    return {id: 'tc-1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'use Cloud Score+ instead'}}
}

function aFakeConversations() {
    let attached = null
    return {
        attach(conversation) { attached = conversation },
        get$: () => of(attached)
    }
}

function counter(prefix) {
    let n = 0
    return () => `${prefix}${++n}`
}

function textOf(events) {
    return events.filter(event => event.textDelta).map(event => event.textDelta).join('')
}

function pendingCreatedIn(turnEvents) {
    return turnEvents
        .map(event => isChannelEmission(event) ? event.event : event)
        .find(event => event.kind === 'conversation-pending-action-created')
}
