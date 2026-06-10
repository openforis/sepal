import {of} from 'rxjs'

import {aConversationHarness, collect, firstValue} from '../harness.js'

describe('conversation.resumePendingTool$', () => {

    it('invokes the supplied tool directly without calling the LLM', async () => {
        const harness = aConversationWithDirectAnswer({answer: 'Updated.'})

        await collect(harness.resume({answer: 'Yes, add Sentinel-2'}))

        expect(harness.invocations).toEqual([anUpdateRecipeCall()])
        expect(harness.llm.receivedMessages).toEqual([])
    })

    it('streams the tool result\'s directAnswer text as a chat-response textDelta', async () => {
        const harness = aConversationWithDirectAnswer({answer: 'Added Sentinel-2 and switched to Cloud Score+.'})

        const events = await collect(harness.resume({answer: 'Yes, add Sentinel-2'}))

        expect(events).toContainEqual({textDelta: 'Added Sentinel-2 and switched to Cloud Score+.'})
    })

    it('persists the user answer + tool plumbing + assistant directAnswer so later turns see the full exchange', async () => {
        const harness = aConversationWithDirectAnswer({answer: 'Updated.'})

        await collect(harness.resume({answer: 'Yes'}))

        const stored = await firstValue(harness.history.load$())
        expect(stored).toEqual([
            {role: 'user', content: 'Yes'},
            {role: 'assistant', content: '', toolCalls: [anUpdateRecipeCall()]},
            {role: 'tool', toolResults: [{toolCallId: 'tc-1', toolName: 'update_recipe', result: {ok: true, data: {answer: 'Updated.'}}}]},
            {role: 'assistant', content: 'Updated.'}
        ])
    })

    it('serializes onto the turn-queue so a concurrent sendUserMessage$ does not interleave', async () => {
        const harness = aConversationWithDirectAnswer({answer: 'Updated.'})

        const resume$ = harness.resume({answer: 'Yes'})
        const later$ = harness.conversation.sendUserMessage$('next question')

        await collect(resume$)
        await collect(later$)

        const stored = await firstValue(harness.history.load$())
        const userTexts = stored.filter(message => message.role === 'user').map(message => message.content)
        expect(userTexts).toEqual(['Yes', 'next question'])
    })
})

function anUpdateRecipeCall() {
    return {id: 'tc-1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'augmented instruction'}}
}

function aConversationWithDirectAnswer({answer}) {
    const tool = {
        name: 'update_recipe',
        description: 'Update.',
        directAnswer: true,
        parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}},
        invoke$: () => of({ok: true, data: {answer}})
    }
    const harness = aConversationHarness({
        replies: [{text: 'ORCHESTRATOR LLM REPLY (should never run for resume)'}],
        tools: [tool]
    })
    return {
        ...harness,
        resume({answer: answerText}) {
            return harness.conversation.resumePendingTool$({
                toolCall: anUpdateRecipeCall(),
                userAnswerText: answerText,
                toolContext: {conversationId: 'conv-1'}
            })
        }
    }
}
