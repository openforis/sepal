const {of} = require('rxjs')
const {createPendingActions} = require('#mcp/chat/conversation/pendingActions')
const {isChannelEmission} = require('#mcp/chat/channelEvents')
const {aConversationHarness, collect} = require('../../harness')

const QUESTION = 'What area should this mosaic cover? Send me a polygon or pick a country/region.'

describe('a create_recipe CLARIFICATION_NEEDED result records a pending action', () => {

    it('streams the directAnswer question text to the user and emits conversation-pending-action-created in the same turn', async () => {
        const {send$} = aHarnessThatClarifies()

        const turnEvents = await collect(send$('Create a mosaic'))

        expect(textOf(turnEvents)).toContain(QUESTION)
        expect(pendingCreatedIn(turnEvents).payload.pendingAction).toMatchObject({
            id: 'pa-1', toolName: 'create_recipe', question: QUESTION
        })
    })

    it('records the pending action keyed by conversationId, preserving the original create args (recipeType, projectId, name, instruction)', async () => {
        const harness = aHarnessThatClarifies()

        await collect(harness.send$('Create a mosaic'))

        expect(harness.pendingActions.get('conv-1')).toMatchObject({
            toolName: 'create_recipe',
            args: {
                recipeType: 'MOSAIC',
                projectId: 'p1',
                name: 'Kenya',
                instruction: 'Create a mosaic'
            },
            question: QUESTION
        })
    })

    it('does not record a pending action when the create_recipe tool succeeds', async () => {
        const harness = aHarnessThatClarifies({result: {ok: true, data: {answer: 'Created.'}}})

        const turnEvents = await collect(harness.send$('Create a mosaic of polygon'))

        expect(harness.pendingActions.get('conv-1')).toBeUndefined()
        expect(pendingCreatedIn(turnEvents)).toBeUndefined()
    })
})

function aHarnessThatClarifies({result = aClarificationResult()} = {}) {
    const tool = {
        name: 'create_recipe',
        description: 'Create.',
        directAnswer: true,
        parameters: {type: 'object', properties: {recipeType: {type: 'string'}, instruction: {type: 'string'}, projectId: {type: 'string'}, name: {type: 'string'}}},
        invoke$: () => of(result)
    }
    const conversations = aFakeConversations()
    const pendingActions = createPendingActions({
        conversations,
        createId: counter('pa-'),
        clock: {nowIso: () => '2026-05-26T10:00:00.000Z'}
    })
    const harness = aConversationHarness({
        replies: [
            {toolCalls: [aCreateRecipeCall()]},
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

function aCreateRecipeCall() {
    return {id: 'tc-1', name: 'create_recipe', input: {recipeType: 'MOSAIC', instruction: 'Create a mosaic', projectId: 'p1', name: 'Kenya'}}
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
