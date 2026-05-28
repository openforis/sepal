const {of} = require('rxjs')
const {aConversationHarness, collect, firstValue} = require('../../harness')

// Reasoning_content round-trips on assistant turns: it persists to history,
// rides back to the LLM on the next round, and is stripped from the
// client-facing snapshot. The silent-round carrier is request-scoped only.

const toolCall = {id: 't1', name: 'recipe_list', input: {}}
const recipeList = {
    name: 'recipe_list', description: 'List recipes.',
    parameters: {type: 'object', properties: {}, additionalProperties: true},
    invoke$: () => of([])
}

describe('reasoning round-trip', () => {

    it('persists reasoning on a tool-call assistant turn and round-trips it to the next LLM call', async () => {
        const run = await aTurnWith([
            {toolCalls: [toolCall], responseMeta: {reasoning: 'plan'}},
            {text: 'Done.'}
        ])

        expect(toolCallTurnIn(run.history)).toMatchObject({reasoning: 'plan'})
        expect(toolCallTurnIn(run.llmCalls[1])).toMatchObject({reasoning: 'plan'})
    })

    it('persists reasoning on a text-only assistant turn', async () => {
        const run = await aTurnWith([{text: 'Hi.', responseMeta: {reasoning: 'acknowledging'}}])

        expect(assistantTurnIn(run.history)).toMatchObject({content: 'Hi.', reasoning: 'acknowledging'})
    })

    it('omits the reasoning field when none was emitted (no empty-string poisoning)', async () => {
        const run = await aTurnWith([
            {toolCalls: [toolCall], responseMeta: {finishReason: 'tool_calls'}},
            {text: 'Done.'}
        ])

        expect(toolCallTurnIn(run.history)).not.toHaveProperty('reasoning')
    })

    it('takes the latest responseMeta within a call as the truth (later empty wipes earlier text)', async () => {
        const run = await aTurnWith([
            {events: [
                {responseMeta: {reasoning: 'thought from a stalled first attempt'}},
                {textDelta: 'Hi.'},
                {responseMeta: {reasoning: ''}}
            ]}
        ])

        expect(assistantTurnIn(run.history)).not.toHaveProperty('reasoning')
    })
})

describe('reasoning across the empty-after-tool retry', () => {

    it('rides forward to the retry call as a transient assistant turn', async () => {
        const run = await aTurnWith([
            {toolCalls: [toolCall], responseMeta: {reasoning: 'plan'}},
            {text: '', responseMeta: {reasoning: 'should have answered'}},
            {text: 'Final.'}
        ])

        expect(run.llmCalls[2]).toContainEqual(expect.objectContaining({
            role: 'assistant', reasoning: 'should have answered'
        }))
    })

    it('does NOT persist the silent reasoning carrier — it is request-scoped, not conversation state', async () => {
        const run = await aTurnWith([
            {toolCalls: [toolCall], responseMeta: {reasoning: 'plan'}},
            {text: '', responseMeta: {reasoning: 'should have answered'}},
            {text: 'Final.'}
        ])

        expect(run.history.find(message => message.reasoning === 'should have answered')).toBeUndefined()
    })

    it('skips the synthetic carrier when the silent round had no reasoning', async () => {
        const run = await aTurnWith([{toolCalls: [toolCall]}, {text: ''}, {text: 'Final.'}])

        expect(emptyAssistantTurns(run.llmCalls[2])).toHaveLength(0)
    })

    it('does not persist an empty final reply (no blank assistant turn polluting history)', async () => {
        const run = await aTurnWith([{toolCalls: [toolCall]}, {text: ''}, {text: ''}])

        expect(emptyAssistantTurns(run.history)).toHaveLength(0)
    })
})

describe('client-facing snapshot', () => {

    it('strips reasoning from every assistant turn', async () => {
        const run = await aTurnWith([
            {toolCalls: [toolCall], responseMeta: {reasoning: 'plan'}},
            {text: 'Done.', responseMeta: {reasoning: 'wrap up'}}
        ])

        for (const turn of run.snapshot.filter(message => message.role === 'assistant')) {
            expect(turn).not.toHaveProperty('reasoning')
        }
    })

    it('does not surface the transient silent carrier (it never enters the messages array)', async () => {
        const run = await aTurnWith([
            {toolCalls: [toolCall], responseMeta: {reasoning: 'plan'}},
            {text: '', responseMeta: {reasoning: 'silent post-tool'}},
            {text: 'Final.'}
        ])

        expect(run.snapshot.find(message => message.reasoning === 'silent post-tool')).toBeUndefined()
    })
})

async function aTurnWith(replies) {
    const harness = aConversationHarness({replies, tools: [recipeList]})
    await collect(harness.send$('list'))
    return {
        history: await firstValue(harness.history.load$()),
        llmCalls: harness.llm.receivedMessages,
        snapshot: harness.conversation.messagesSnapshot()
    }
}

function toolCallTurnIn(messages) {
    return messages.find(message => message.role === 'assistant' && message.toolCalls)
}

function assistantTurnIn(messages) {
    return messages.find(message => message.role === 'assistant')
}

function emptyAssistantTurns(messages) {
    return messages.filter(message =>
        message.role === 'assistant'
        && !message.toolCalls
        && (typeof message.content !== 'string' || message.content.trim() === '')
    )
}
