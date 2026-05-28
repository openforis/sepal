const mockCreate = jest.fn()

jest.mock('openai', () => ({
    default: jest.fn().mockImplementation(() => ({
        chat: {completions: {create: mockCreate}}
    }))
}))

const {anOpenAiChat, collect} = require('./openaiAdapterHarness')
const {aRecordingBus} = require('../../harness')
const {toolSchemas} = require('../providerConformance')

describe('OpenAI adapter — diagnostic bus events', () => {

    beforeEach(() => mockCreate.mockReset())

    function eventsOf(bus, type) {
        return bus.events.filter(event => event.type === type)
    }

    describe('llm.request', () => {

        it('reports request params (max_tokens, temperature, tool_choice, enable_thinking) in the message', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}],
                maxTokens: 64, temperature: 0.2, tools: toolSchemas,
                extraParams: {chat_template_kwargs: {enable_thinking: false}},
                debugLabel: 'specialist.update conv-1'
            }))

            const text = eventsOf(bus, 'llm.request')[0].message()
            expect(text).toMatch(/max_tokens=64/)
            expect(text).toMatch(/temperature=0\.2/)
            expect(text).toMatch(/tool_choice=auto/)
            expect(text).toMatch(/enable_thinking=false/)
        })

        it('omits enable_thinking from the message when extraParams does not set it', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}], debugLabel: 'specialist.update conv-1'
            }))

            expect(eventsOf(bus, 'llm.request')[0].message()).not.toMatch(/enable_thinking/)
        })

        it('carries prompt-part byte counts + short hashes as a structured field', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'system', content: 'You are a helper.'}, {role: 'user', content: 'set the date'}],
                tools: toolSchemas, debugLabel: 'orchestrator conv-1'
            }))

            const request = eventsOf(bus, 'llm.request')[0]
            expect(request.parts.system).toMatchObject({bytes: expect.any(Number), hash: expect.stringMatching(/^[0-9a-f]{8}$/)})
            expect(request.parts.body).toMatchObject({bytes: expect.any(Number), hash: expect.stringMatching(/^[0-9a-f]{8}$/)})
            expect(request.parts.tools).toMatchObject({bytes: expect.any(Number), hash: expect.stringMatching(/^[0-9a-f]{8}$/)})
        })

        it('produces the same system hash across calls that share the leading system messages — the cacheable-prefix signal', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

            const system = {role: 'system', content: 'You are a helper.'}
            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [system, {role: 'user', content: 'turn 1'}], debugLabel: 'orchestrator conv-1'
            }))
            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [system, {role: 'user', content: 'turn 2 — different body'}], debugLabel: 'orchestrator conv-1'
            }))

            const [first, second] = eventsOf(bus, 'llm.request')
            expect(first.parts.system.hash).toBe(second.parts.system.hash)
            expect(first.parts.body.hash).not.toBe(second.parts.body.hash)
        })
    })

    describe('llm.response', () => {

        it('tags each llm.response with its attempt index — 0 first, 1 on the length-cap retry', async () => {
            const bus = aRecordingBus()
            mockCreate
                .mockResolvedValueOnce([
                    {choices: [{delta: {reasoning_content: 'planning...'}}]},
                    {choices: [{finish_reason: 'length', delta: {}}]}
                ])
                .mockResolvedValueOnce([{choices: [{delta: {content: 'recovered.'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({messages: [{role: 'user', content: 'edit'}], debugLabel: 'title conv-9'}))

            expect(eventsOf(bus, 'llm.response').map(event => event.attempt)).toEqual([0, 1])
        })

        it('emits a counts-only debug summary (no raw response logs)', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([{choices: [{delta: {content: 'Title'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({messages: [{role: 'user', content: 'hi'}], debugLabel: 'title conv-9'}))

            expect(eventsOf(bus, 'llm.response')[0].message()).toContain('contentChunks=1')
        })

        it('captures reasoning_content deltas — debug carries counts, trace payload carries text', async () => {
            const bus = aRecordingBus()
            const {createDiagnostics} = require('#mcp/chat/diagnostics')
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: 'Inner thought.'}}]},
                {choices: [{delta: {content: 'Done.'}}]}
            ])

            await collect(anOpenAiChat({bus, diagnostics: createDiagnostics({fullPayloads: true})}).respondTo$({
                messages: [{role: 'user', content: 'q'}], debugLabel: 'title conv-9'
            }))

            const debug = eventsOf(bus, 'llm.response')[0]
            const trace = eventsOf(bus, 'llm.responsePayload')[0]
            expect(debug.message()).toContain('reasoningBytes=')
            expect(debug.message()).toContain('reasoningHash=')
            expect(debug.message()).not.toContain('Inner thought.')
            expect(trace.message()).toContain('Inner thought.')
        })
    })

    describe('llm.reasoningOnly', () => {

        const reasoningOnlyChunks = reasoning => [
            {choices: [{delta: {reasoning_content: reasoning}}]},
            {choices: [{finish_reason: 'stop', delta: {}}]}
        ]

        it('fires when the call ended with reasoning but no content text and no actionable tool call', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue(reasoningOnlyChunks('I will stop here.'))

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'edit'}], debugLabel: 'recipe.update conv-1',
                usageContext: {role: 'specialist', specialist: 'recipe.update', conversationId: 'conv-1'}
            }))

            expect(eventsOf(bus, 'llm.reasoningOnly')[0]).toMatchObject({
                level: 'debug',
                role: 'specialist',
                specialist: 'recipe.update',
                conversationId: 'conv-1',
                finishReason: 'stop',
                reasoningChars: 'I will stop here.'.length
            })
        })

        it('keeps the raw reasoning tail on a paired trace-level llm.reasoningOnly.body event', async () => {
            const bus = aRecordingBus()
            const reasoning = 'HEAD_MARKER' + 'x'.repeat(400) + 'TAIL_MARKER'
            mockCreate.mockResolvedValue(reasoningOnlyChunks(reasoning))

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'edit'}], debugLabel: 'recipe.update conv-1'
            }))

            const debug = eventsOf(bus, 'llm.reasoningOnly')[0]
            const trace = eventsOf(bus, 'llm.reasoningOnly.body')[0]
            expect(debug.reasoningChars).toBe(reasoning.length)
            expect(debug.message).not.toContain('TAIL_MARKER')
            expect(trace).toMatchObject({level: 'trace'})
            expect(trace.message()).toContain('TAIL_MARKER')
            expect(trace.message()).not.toContain('HEAD_MARKER')
        })

        it.each([
            ['content text was emitted', [
                {choices: [{delta: {reasoning_content: 'thinking'}}]},
                {choices: [{delta: {content: 'Done.'}}]},
                {choices: [{finish_reason: 'stop', delta: {}}]}
            ], []],
            ['an actionable tool call was emitted alongside reasoning', [
                {choices: [{delta: {reasoning_content: 'thinking'}}]},
                {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"hi"}'}}]}}]},
                {choices: [{finish_reason: 'tool_calls', delta: {}}]}
            ], toolSchemas]
        ])('does not fire when %s', async (_label, chunks, tools) => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue(chunks)

            await collect(anOpenAiChat({bus}).respondTo$({messages: [{role: 'user', content: 'hi'}], tools}))

            expect(eventsOf(bus, 'llm.reasoningOnly')).toHaveLength(0)
        })

        it('fires when finish_reason=length on a reasoning-only response', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: 'lots of planning'}}]},
                {choices: [{finish_reason: 'length', delta: {}}]}
            ])

            await collect(anOpenAiChat({bus}).respondTo$({messages: [{role: 'user', content: 'edit'}]}))

            expect(eventsOf(bus, 'llm.reasoningOnly')[0].finishReason).toBe('length')
        })
    })

    describe('llm.lengthCap', () => {

        it('flags empty=true and willRetry=true when length-cap will trigger a retry', async () => {
            const bus = aRecordingBus()
            mockCreate
                .mockResolvedValueOnce([
                    {choices: [{delta: {reasoning_content: 'planning'}}]},
                    {choices: [{finish_reason: 'length', delta: {}}]}
                ])
                .mockResolvedValueOnce([{choices: [{delta: {content: 'recovered.'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'edit'}], debugLabel: 'recipe.update conv-1'
            }))

            const caps = eventsOf(bus, 'llm.lengthCap')
            expect(caps[0]).toMatchObject({empty: true, willRetry: true})
        })

        it('marks empty=false when partial content was emitted before the length cap', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([
                {choices: [{delta: {content: 'partial '}}]},
                {choices: [{delta: {content: 'answer'}}]},
                {choices: [{finish_reason: 'length', delta: {}}]}
            ])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'long'}], debugLabel: 'recipe.update conv-1'
            }))

            expect(eventsOf(bus, 'llm.lengthCap')[0]).toMatchObject({empty: false, willRetry: false})
        })

        it('does not fire when finish_reason is not length', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([
                {choices: [{delta: {content: 'done.'}}]},
                {choices: [{finish_reason: 'stop', delta: {}}]}
            ])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}], debugLabel: 'recipe.update conv-1'
            }))

            expect(eventsOf(bus, 'llm.lengthCap')).toHaveLength(0)
        })
    })
})
