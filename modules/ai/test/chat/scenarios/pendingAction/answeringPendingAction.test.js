import {of} from 'rxjs'

import {anAdvancingClock, aUserChatHarness, collect, firstValue} from '../../harness.js'

const CONVERSATION_ID = 'conv-1'
const SUB = {clientId: 'c1', subscriptionId: 's1'}
const QUESTION = 'Do you want to add Sentinel-2 to this recipe?'
const T_CREATE = '2026-05-26T10:00:00.000Z'
const T_MESSAGE = '2026-05-26T10:01:00.000Z'
const T_ANSWER = '2026-05-26T10:02:00.000Z'

describe('answering a pending action', () => {

    it('reinvokes the original tool with the augmented instruction (original request + clarification question + answer)', async () => {
        const harness = aHarnessThatClarifiesThenSucceeds()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))

        await collect(answerPendingAction(harness, 'Yes, add Sentinel-2'))

        const resumed = updateRecipeInvocationsOf(harness)[1]
        expect(resumed.input.instruction).toContain('Use Cloud Score+ instead')
        expect(resumed.input.instruction).toContain(QUESTION)
        expect(resumed.input.instruction).toContain('Yes, add Sentinel-2')
    })

    it('streams the resumed tool\'s directAnswer to the user', async () => {
        const harness = aHarnessThatClarifiesThenSucceeds({successAnswer: 'Added Sentinel-2 and switched to Cloud Score+.'})
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))

        const eventsSince = harness.eventsMarker()
        await collect(answerPendingAction(harness, 'Yes, add Sentinel-2'))

        expect(textIn(harness.eventsSince(eventsSince))).toContain('Added Sentinel-2 and switched to Cloud Score+.')
    })

    it('does not call the orchestrator LLM for the resume', async () => {
        const harness = aHarnessThatClarifiesThenSucceeds()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))
        const llmCallsBefore = harness.llm.receivedMessages.length

        await collect(answerPendingAction(harness, 'Yes, add Sentinel-2'))

        expect(harness.llm.receivedMessages).toHaveLength(llmCallsBefore)
    })

    it('clears the active pending action', async () => {
        const harness = aHarnessThatClarifiesThenSucceeds()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))
        expect(harness.pendingActions.get(CONVERSATION_ID)).toMatchObject({id: 'pa-1'})

        await collect(answerPendingAction(harness, 'Yes, add Sentinel-2'))

        expect(harness.pendingActions.get(CONVERSATION_ID)).toBeUndefined()
    })

    it('propagates the WS subscription (clientId, subscriptionId) and cached guiContext into the resumed tool\'s context so GUI-backed tools route correctly', async () => {
        const seenContexts = []
        const harness = aHarnessThatClarifiesThenSucceeds({captureContexts: seenContexts})
        await collect(harness.handle$({type: 'context', ...SUB, guiContext: {recipeId: 'r1', section: 'process'}}))
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))

        await collect(answerPendingAction(harness, 'Yes, add Sentinel-2'))

        const resumedContext = seenContexts[seenContexts.length - 1]
        expect(resumedContext).toMatchObject({
            conversationId: CONVERSATION_ID,
            clientId: SUB.clientId,
            subscriptionId: SUB.subscriptionId,
            guiContext: {recipeId: 'r1', section: 'process'}
        })
    })

    it('touches the conversation\'s updatedAt timestamp on answer, matching the lifecycle of a normal message turn', async () => {
        const harness = aHarnessThatClarifiesThenSucceeds({
            clock: anAdvancingClock([dateMs(T_CREATE), dateMs(T_MESSAGE), dateMs(T_ANSWER)])
        })
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))

        await collect(answerPendingAction(harness, 'Yes, add Sentinel-2'))

        const [meta] = await firstValue(harness.conversationsStore.list$())
        expect(meta.updatedAt).toBe(T_ANSWER)
    })

    it('rejects a mismatched pendingActionId with a pending-action-error and does not invoke the tool', async () => {
        const harness = aHarnessThatClarifiesThenSucceeds()
        await collect(sendMessage(harness, 'Use Cloud Score+ instead'))
        const beforeAnswer = updateRecipeInvocationsOf(harness).length

        const eventsSince = harness.eventsMarker()
        await collect(harness.handle$({
            type: 'answer-pending-action', conversationId: CONVERSATION_ID,
            pendingActionId: 'wrong-id', answer: 'Yes'
        }))

        expect(updateRecipeInvocationsOf(harness)).toHaveLength(beforeAnswer)
        expect(harness.pendingActions.get(CONVERSATION_ID)).toMatchObject({id: 'pa-1'})
        expect(harness.eventsSince(eventsSince)).toEqual([{
            kind: 'pending-action-error',
            targeting: 'targeted',
            payload: {conversationId: CONVERSATION_ID, pendingActionId: 'wrong-id', code: 'PENDING_ACTION_NOT_FOUND', message: expect.any(String)}
        }])
    })
})

function aHarnessThatClarifiesThenSucceeds({
    successAnswer = 'Added Sentinel-2 and switched to Cloud Score+.',
    captureContexts,
    clock
} = {}) {
    let updateCalls = 0
    const updateRecipe = {
        name: 'update_recipe',
        description: 'Update.',
        directAnswer: true,
        parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}},
        invoke$: (_input, context) => {
            updateCalls++
            captureContexts?.push(context)
            return updateCalls === 1
                ? of({ok: false, error: {code: 'CLARIFICATION_NEEDED', answer: QUESTION}})
                : of({ok: true, data: {answer: successAnswer}})
        }
    }
    const harness = aUserChatHarness({
        replies: [
            {toolCalls: [anUpdateRecipeCall('Use Cloud Score+ instead')]}
        ],
        tools: [updateRecipe],
        ...(clock ? {clock} : {})
    })
    harness.handle$({type: 'create-conversation'}).subscribe()
    return harness
}

function dateMs(iso) {
    return new Date(iso).getTime()
}

function anUpdateRecipeCall(instruction) {
    return {id: 'tc-1', name: 'update_recipe', input: {recipeId: 'r1', instruction}}
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

function updateRecipeInvocationsOf(harness) {
    return harness.invocations.filter(call => call.name === 'update_recipe')
}

function textIn(events) {
    return events.filter(event => event.kind === 'chat-response' && event.payload?.text)
        .map(event => event.payload.text)
        .join('')
}
