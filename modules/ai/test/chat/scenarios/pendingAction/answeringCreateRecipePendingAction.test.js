const {of} = require('rxjs')
const {aUserChatHarness, collect} = require('../../harness')

const CONVERSATION_ID = 'conv-1'
const SUB = {clientId: 'c1', subscriptionId: 's1'}
const QUESTION = 'What area should this mosaic cover?'

describe('answering a create_recipe pending action reinvokes create_recipe', () => {

    it('reruns create_recipe preserving the original recipeType/projectId/name and augmenting the instruction with the answer', async () => {
        const harness = aHarnessThatClarifiesThenSucceeds()
        await collect(sendMessage(harness, 'Create a Kenya mosaic'))

        await collect(answerPendingAction(harness, 'Use this polygon: [[36.7,-1.4],[37.0,-1.4],[37.0,-1.1]]'))

        const createCalls = harness.invocations.filter(call => call.name === 'create_recipe')
        expect(createCalls).toHaveLength(2)
        const resumed = createCalls[1]
        // Workflow-bound identity fields are preserved.
        expect(resumed.input.recipeType).toBe('MOSAIC')
        expect(resumed.input.projectId).toBe('p1')
        expect(resumed.input.name).toBe('Kenya')
        // The augmented instruction carries the original request, the clarification question, and the answer.
        expect(resumed.input.instruction).toContain('Create a Kenya mosaic')
        expect(resumed.input.instruction).toContain(QUESTION)
        expect(resumed.input.instruction).toContain('[[36.7,-1.4]')
    })

    it('streams the resumed tool\'s directAnswer to the user', async () => {
        const harness = aHarnessThatClarifiesThenSucceeds({successAnswer: 'Created the Kenya mosaic.'})
        await collect(sendMessage(harness, 'Create a Kenya mosaic'))

        const eventsSince = harness.eventsMarker()
        await collect(answerPendingAction(harness, 'polygon ...'))

        expect(textIn(harness.eventsSince(eventsSince))).toContain('Created the Kenya mosaic.')
    })

    it('clears the active pending action after a successful answer', async () => {
        const harness = aHarnessThatClarifiesThenSucceeds()
        await collect(sendMessage(harness, 'Create a Kenya mosaic'))
        expect(harness.pendingActions.get(CONVERSATION_ID)).toMatchObject({id: 'pa-1'})

        await collect(answerPendingAction(harness, 'polygon ...'))

        expect(harness.pendingActions.get(CONVERSATION_ID)).toBeUndefined()
    })
})

function aHarnessThatClarifiesThenSucceeds({successAnswer = 'Created.'} = {}) {
    let createCalls = 0
    const createRecipe = {
        name: 'create_recipe',
        description: 'Create.',
        directAnswer: true,
        parameters: {type: 'object', properties: {recipeType: {type: 'string'}, instruction: {type: 'string'}, projectId: {type: 'string'}, name: {type: 'string'}}},
        invoke$: () => {
            createCalls++
            return createCalls === 1
                ? of({ok: false, error: {code: 'CLARIFICATION_NEEDED', answer: QUESTION}})
                : of({ok: true, data: {answer: successAnswer}})
        }
    }
    const harness = aUserChatHarness({
        replies: [{toolCalls: [aCreateRecipeCall('Create a Kenya mosaic')]}],
        tools: [createRecipe]
    })
    harness.handle$({type: 'create-conversation'}).subscribe()
    return harness
}

function aCreateRecipeCall(instruction) {
    return {id: 'tc-1', name: 'create_recipe', input: {recipeType: 'MOSAIC', instruction, projectId: 'p1', name: 'Kenya'}}
}

function sendMessage(harness, text) {
    return harness.handle$({type: 'message', conversationId: CONVERSATION_ID, text, ...SUB})
}

function answerPendingAction(harness, answer) {
    return harness.handle$({
        type: 'answer-pending-action',
        conversationId: CONVERSATION_ID,
        pendingActionId: 'pa-1',
        answer,
        ...SUB
    })
}

function textIn(events) {
    return events.filter(event => event.kind === 'chat-response' && event.payload?.text)
        .map(event => event.payload.text)
        .join('')
}
