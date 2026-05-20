const {of} = require('rxjs')
const {aConversationHarness, collect} = require('../../harness')

const recipeListSchema = {
    name: 'recipe_list',
    description: 'List recipes.',
    parameters: {type: 'object', properties: {}, additionalProperties: true}
}

function hintedCalls(receivedMessages) {
    return receivedMessages.filter(messages =>
        messages?.at(-1)?.role === 'system' && /empty/i.test(messages.at(-1).content)
    )
}

describe('empty reply after a tool round', () => {

    const toolCall = {id: 't1', name: 'recipe_list', input: {}}
    const emptyReply = {text: ''}

    it('retries the LLM once with a trailing empty-after-tool system hint', async () => {
        const harness = aConversationHarness({
            replies: [
                {toolCalls: [toolCall]},
                emptyReply,
                {text: 'No tool here can do that.'}
            ],
            tools: [{
                ...recipeListSchema,
                invoke$: () => of([])
            }]
        })

        const events = await collect(harness.send$('open the latest recipe'))

        expect(harness.llm.receivedMessages).toHaveLength(3)
        const retryMessages = harness.llm.receivedMessages[2]
        expect(retryMessages.at(-1)).toEqual({
            role: 'system',
            content: expect.stringMatching(/empty/i)
        })
        expect(events.at(-1)).toEqual({textDelta: 'No tool here can do that.'})
    })

    it('does not retry a second time when the retry itself is also empty', async () => {
        const harness = aConversationHarness({
            replies: [{toolCalls: [toolCall]}, emptyReply, emptyReply],
            tools: [{
                ...recipeListSchema,
                invoke$: () => of([])
            }]
        })

        await collect(harness.send$('open it'))

        // The hint is injected exactly once: it rides the final LLM call and
        // no further call follows, so a still-empty retry ends the turn rather
        // than looping.
        const finalMessages = harness.llm.receivedMessages.at(-1)
        expect(finalMessages.at(-1)).toEqual({
            role: 'system',
            content: expect.stringMatching(/empty/i)
        })
        expect(hintedCalls(harness.llm.receivedMessages)).toHaveLength(1)
    })

    it('invokes a tool the LLM emits on the retry after a failed tool result, with tools still available', async () => {
        const retryToolCall = {id: 't2', name: 'recipe_list', input: {type: 'MOSAIC'}}
        const failingThenOk = (() => {
            let calls = 0
            return () => of(++calls === 1
                ? {ok: false, error: {code: 'NO_MATCH', message: 'not found'}}
                : {ok: true, data: []})
        })()
        const harness = aConversationHarness({
            replies: [
                {toolCalls: [toolCall]},
                emptyReply,
                {toolCalls: [retryToolCall]},
                {text: 'Done.'}
            ],
            tools: [{...recipeListSchema, invoke$: failingThenOk}]
        })

        await collect(harness.send$('open it'))

        expect(harness.invocations).toEqual([toolCall, retryToolCall])
        expect(harness.llm.receivedTools[2]).toEqual([recipeListSchema])
    })
})
