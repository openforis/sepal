const {firstValueFrom, toArray} = require('rxjs')

const mockCreate = jest.fn()

jest.mock('openai', () => ({
    default: jest.fn().mockImplementation(() => ({
        chat: {
            completions: {
                create: mockCreate
            }
        }
    }))
}))

const {createOpenAiChatCompletions} = require('#mcp/chat/llm/providers/openaiChatCompletions')
const {toolSchemas, conversationWithToolRoundTrip} = require('../providerConformance')

describe('OpenAI-compatible chat-completions adapter', () => {

    beforeEach(() => {
        mockCreate.mockReset()
    })

    function anOpenAiChat(overrides = {}) {
        return createOpenAiChatCompletions({
            baseURL: 'http://example.test/v1',
            apiKey: 'test-key',
            model: 'test-model',
            bus: {publish: () => {}},
            ...overrides
        })
    }

    function collect(response$) {
        return firstValueFrom(response$.pipe(toArray()))
    }

    it('passes bounded generation and provider-specific extra params', async () => {
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'Title'}}]}])

        const events = await collect(anOpenAiChat().respondTo$({
            messages: [{role: 'user', content: 'hello'}],
            maxTokens: 32,
            temperature: 0,
            extraParams: {chat_template_kwargs: {enable_thinking: false}}
        }))

        expect(events).toEqual([{textDelta: 'Title'}])
        expect(mockCreate).toHaveBeenCalledWith({
            model: 'test-model',
            messages: [{role: 'user', content: 'hello'}],
            stream: true,
            chat_template_kwargs: {enable_thinking: false},
            max_tokens: 32,
            temperature: 0
        })
    })

    it('sends tool schemas in provider function format and lets the model choose', async () => {
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

        await collect(anOpenAiChat().respondTo$({
            messages: [{role: 'user', content: 'hi'}], tools: toolSchemas
        }))

        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            tools: [{type: 'function', function: {
                name: 'echo', description: 'Echo input text.', parameters: toolSchemas[0].parameters
            }}],
            tool_choice: 'auto'
        }))
    })

    it('defaults max_tokens to 4096 when the caller does not specify one (so LM Studio defaults don\'t silently length-cap normal chat/tool calls)', async () => {
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

        await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(mockCreate.mock.calls[0][0].max_tokens).toBe(4096)
    })

    it('an explicit caller maxTokens overrides the default (title generation passes 32 — it must still win)', async () => {
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'Title'}}]}])

        await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}], maxTokens: 32}))

        expect(mockCreate.mock.calls[0][0].max_tokens).toBe(32)
    })

    it('does not send a tools param when no tools are provided', async () => {
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

        await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('tools')
        expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('tool_choice')
    })

    it('formats internal tool-call and tool-result messages into the provider message shape, naming the originating tool in the result content', async () => {
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'done'}}]}])

        await collect(anOpenAiChat().respondTo$({messages: conversationWithToolRoundTrip}))

        expect(mockCreate.mock.calls[0][0].messages).toEqual([
            {role: 'user', content: 'list'},
            {role: 'assistant', content: null, tool_calls: [
                {id: 'call_1', type: 'function', function: {name: 'echo', arguments: '{"text":"hi"}'}}
            ]},
            {role: 'tool', tool_call_id: 'call_1', content: '{"toolName":"echo","ok":true,"data":{"echoed":"hi"}}'},
            {role: 'tool', tool_call_id: 'call_2', content: '{"toolName":"echo","ok":false,"error":{"code":"TOOL_FAILED"}}'}
        ])
    })

    it('treats whitespace-only assistant content on a tool-call message as null (OpenAI spec wants null or substantive content alongside tool_calls)', async () => {
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

        await collect(anOpenAiChat().respondTo$({messages: [
            {role: 'user', content: 'list'},
            {
                role: 'assistant',
                content: '\n\n',
                toolCalls: [{id: 'call_1', name: 'echo', input: {text: 'hi'}}]
            }
        ]}))

        const assistantMessage = mockCreate.mock.calls[0][0].messages[1]
        expect(assistantMessage.content).toBeNull()
    })

    it('strips the GUI display descriptor from assistant messages before sending them to the provider', async () => {
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

        await collect(anOpenAiChat().respondTo$({messages: [
            {role: 'user', content: 'q'},
            {
                role: 'assistant',
                content: 'Step cap reached.',
                display: {key: 'home.chat.notices.toolRoundCap', args: {max: 8}, fallback: 'Step cap reached.'}
            }
        ]}))

        expect(mockCreate.mock.calls[0][0].messages).toEqual([
            {role: 'user', content: 'q'},
            {role: 'assistant', content: 'Step cap reached.'}
        ])
    })

    it('parses a streamed tool call into a normalized toolCall event', async () => {
        mockCreate.mockResolvedValue([
            {choices: [{delta: {tool_calls: [
                {index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"hi"}'}}
            ]}}]}
        ])

        const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(events).toEqual([{toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}])
    })

    it('accumulates tool-call arguments fragmented across chunks', async () => {
        mockCreate.mockResolvedValue([
            {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"te'}}]}}]},
            {choices: [{delta: {tool_calls: [{index: 0, function: {arguments: 'xt":"hi"}'}}]}}]}
        ])

        const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(events).toEqual([{toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}])
    })

    it('parses multiple tool calls in one assistant response', async () => {
        mockCreate.mockResolvedValue([
            {choices: [{delta: {tool_calls: [
                {index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"a"}'}},
                {index: 1, id: 'call_2', function: {name: 'echo', arguments: '{"text":"b"}'}}
            ]}}]}
        ])

        const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(events).toEqual([
            {toolCall: {id: 'call_1', name: 'echo', input: {text: 'a'}}},
            {toolCall: {id: 'call_2', name: 'echo', input: {text: 'b'}}}
        ])
    })

    it('emits a toolCall with argsError when the streamed arguments are not valid JSON', async () => {
        mockCreate.mockResolvedValue([
            {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":'}}]}}]}
        ])

        const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(events).toHaveLength(1)
        expect(events[0].toolCall).toMatchObject({id: 'call_1', name: 'echo', input: null})
        expect(events[0].toolCall.argsError).toBeDefined()
    })

    it('emits text deltas before tool calls when an assistant response has both', async () => {
        mockCreate.mockResolvedValue([
            {choices: [{delta: {content: 'Let me check. '}}]},
            {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"hi"}'}}]}}]}
        ])

        const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(events).toEqual([
            {textDelta: 'Let me check. '},
            {toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}
        ])
    })

    describe('length-cap retry — empty length-finished response retried once with a compact hint', () => {

        function aRecordingBus() {
            const published = []
            return {publish: event => published.push(event), published}
        }

        const reasoningOnlyLengthChunks = [
            {choices: [{delta: {reasoning_content: 'planning...'}}]},
            {choices: [{delta: {reasoning_content: 'more planning...'}}]},
            {choices: [{finish_reason: 'length', delta: {}}]}
        ]

        it('retries once when finish_reason=length with no content and no tool calls, and the retry output streams normally', async () => {
            mockCreate
                .mockResolvedValueOnce(reasoningOnlyLengthChunks)
                .mockResolvedValueOnce([{choices: [{delta: {content: 'patched.'}}]}])

            const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'edit'}]}))

            expect(mockCreate).toHaveBeenCalledTimes(2)
            expect(events).toEqual([{textDelta: 'patched.'}])
        })

        it('appends the compact retry hint as a trailing system message on the retry request only', async () => {
            mockCreate
                .mockResolvedValueOnce(reasoningOnlyLengthChunks)
                .mockResolvedValueOnce([{choices: [{delta: {content: 'patched.'}}]}])

            await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'edit'}]}))

            const firstAttemptMessages = mockCreate.mock.calls[0][0].messages
            const retryMessages = mockCreate.mock.calls[1][0].messages
            expect(firstAttemptMessages).toEqual([{role: 'user', content: 'edit'}])
            expect(retryMessages).toEqual([
                {role: 'user', content: 'edit'},
                {role: 'system', content: expect.stringMatching(/RETRY.*reasoning token budget.*compactly.*promptly/i)}
            ])
        })

        it('publishes llm.lengthCap (warn) with empty=true and willRetry=true on the first attempt when retry is going to fire', async () => {
            const bus = aRecordingBus()
            mockCreate
                .mockResolvedValueOnce(reasoningOnlyLengthChunks)
                .mockResolvedValueOnce([{choices: [{delta: {content: 'patched.'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'edit'}],
                debugLabel: 'recipe.update conv-1'
            }))

            const lengthCaps = bus.published.filter(event => event.type === 'llm.lengthCap')
            expect(lengthCaps).toHaveLength(1)
            expect(lengthCaps[0]).toMatchObject({
                level: 'warn',
                debugLabel: 'recipe.update conv-1',
                model: 'test-model',
                attempt: 0,
                empty: true,
                willRetry: true,
                finishReasons: ['length'],
                contentChunkCount: 0,
                toolCallChunkCount: 0,
                reasoningChunkCount: 2
            })
        })

        it('does not retry when partial content was streamed before the length cap (subscribers already saw partial output)', async () => {
            mockCreate.mockResolvedValueOnce([
                {choices: [{delta: {content: 'partial '}}]},
                {choices: [{delta: {content: 'answer'}}]},
                {choices: [{finish_reason: 'length', delta: {}}]}
            ])
            const bus = aRecordingBus()

            const events = await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'long'}],
                debugLabel: 'recipe.update conv-1'
            }))

            expect(mockCreate).toHaveBeenCalledTimes(1)
            expect(events).toEqual([{textDelta: 'partial '}, {textDelta: 'answer'}])
            expect(bus.published.find(event => event.type === 'llm.lengthCap')).toMatchObject({
                empty: false,
                willRetry: false
            })
        })

        it('does not retry when a tool call was emitted alongside the length cap', async () => {
            mockCreate.mockResolvedValueOnce([
                {choices: [{delta: {tool_calls: [
                    {index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"hi"}'}}
                ]}}]},
                {choices: [{finish_reason: 'length', delta: {}}]}
            ])
            const bus = aRecordingBus()

            const events = await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'tool'}],
                debugLabel: 'recipe.update conv-1'
            }))

            expect(mockCreate).toHaveBeenCalledTimes(1)
            expect(events).toEqual([{toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}])
            expect(bus.published.find(event => event.type === 'llm.lengthCap')).toMatchObject({
                empty: false,
                willRetry: false
            })
        })

        it('does not retry a second time when the retry itself also length-caps empty', async () => {
            mockCreate
                .mockResolvedValueOnce(reasoningOnlyLengthChunks)
                .mockResolvedValueOnce(reasoningOnlyLengthChunks)

            const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'edit'}]}))

            expect(mockCreate).toHaveBeenCalledTimes(2)
            expect(events).toEqual([])
        })

        it('does not fire llm.lengthCap when the response finishes for non-length reasons (e.g. stop)', async () => {
            mockCreate.mockResolvedValueOnce([
                {choices: [{delta: {content: 'done.'}}]},
                {choices: [{finish_reason: 'stop', delta: {}}]}
            ])
            const bus = aRecordingBus()

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}],
                debugLabel: 'recipe.update conv-1'
            }))

            expect(bus.published.find(event => event.type === 'llm.lengthCap')).toBeUndefined()
        })
    })

    describe('request option logging — safe fields surfaced for observability', () => {

        function aRecordingBus() {
            const published = []
            return {publish: event => published.push(event), published}
        }

        it('includes max_tokens, temperature, tool_choice, and chat_template_kwargs.enable_thinking in the llm.request message', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}],
                maxTokens: 64,
                temperature: 0.2,
                tools: toolSchemas,
                extraParams: {chat_template_kwargs: {enable_thinking: false}},
                debugLabel: 'specialist.update conv-1'
            }))

            const request = bus.published.find(event => event.type === 'llm.request')
            const text = request.message()
            expect(text).toMatch(/max_tokens=64/)
            expect(text).toMatch(/temperature=0\.2/)
            expect(text).toMatch(/tool_choice=auto/)
            expect(text).toMatch(/enable_thinking=false/)
        })

        it('omits enable_thinking from the log when extraParams does not set it', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}],
                debugLabel: 'specialist.update conv-1'
            }))

            const request = bus.published.find(event => event.type === 'llm.request')
            expect(request.message()).not.toMatch(/enable_thinking/)
        })
    })

    describe('with a debugLabel', () => {
        const debugLabel = 'title conv-9'

        function aRecordingBus() {
            const published = []
            return {publish: event => published.push(event), published}
        }

        it('publishes compact debug request and response summaries without raw chunk logs', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([{choices: [{delta: {content: 'Title'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}],
                debugLabel
            }))

            const request = bus.published.find(event => event.type === 'llm.request')
            const response = bus.published.find(event => event.type === 'llm.response')
            expect(request).toMatchObject({level: 'debug'})
            expect(request.message()).toContain(debugLabel)
            expect(response).toMatchObject({level: 'debug'})
            expect(response.message()).toContain(debugLabel)
            expect(response.message()).toContain('contentChunks=1')
            expect(bus.published).not.toContainEqual(expect.objectContaining({type: 'llm.chunk'}))
            expect(bus.published).not.toContainEqual(expect.objectContaining({type: 'llm.debugChunk'}))
        })

        it('captures reasoning_content deltas and surfaces them in the response summary (for visibility into thinking-mode models like qwen3)', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: 'The user wants '}}]},
                {choices: [{delta: {reasoning_content: 'to set the target date. '}}]},
                {choices: [{delta: {reasoning_content: 'I should call recipe_patch.'}}]},
                {choices: [{delta: {content: 'Setting target date.'}}]}
            ])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'set the date'}],
                debugLabel
            }))

            const response = bus.published.find(event => event.type === 'llm.response')
            const summary = response.message()
            // The chunk count for reasoning is visible in the summary.
            expect(summary).toContain('reasoningChunks=3')
            // The actual reasoning text is surfaced (may be truncated, but the head is present).
            expect(summary).toContain('The user wants')
        })
    })
})
