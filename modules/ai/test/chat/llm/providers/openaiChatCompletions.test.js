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
            clock: {now: () => 0},
            ...overrides
        })
    }

    function collect(response$) {
        return firstValueFrom(response$.pipe(toArray()))
    }

    // Tests that pin chunk→domain-event translation assert on the content events
    // only; the terminal {responseMeta} per-call summary is a separate concern
    // with its own test.
    function contentEvents(events) {
        return events.filter(event => 'textDelta' in event || 'toolCall' in event)
    }

    it('passes bounded generation and provider-specific extra params', async () => {
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'Title'}}]}])

        const events = await collect(anOpenAiChat().respondTo$({
            messages: [{role: 'user', content: 'hello'}],
            maxTokens: 32,
            temperature: 0,
            extraParams: {chat_template_kwargs: {enable_thinking: false}}
        }))

        expect(contentEvents(events)).toEqual([{textDelta: 'Title'}])
        expect(mockCreate).toHaveBeenCalledWith({
            model: 'test-model',
            messages: [{role: 'user', content: 'hello'}],
            stream: true,
            stream_options: {include_usage: true},
            chat_template_kwargs: {enable_thinking: false},
            max_tokens: 32,
            temperature: 0
        })
    })

    it('asks the provider to include token usage in the stream so usage can be exact', async () => {
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

        await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(mockCreate.mock.calls[0][0].stream_options).toEqual({include_usage: true})
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

        expect(contentEvents(events)).toEqual([{toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}])
    })

    it('accumulates tool-call arguments fragmented across chunks', async () => {
        mockCreate.mockResolvedValue([
            {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"te'}}]}}]},
            {choices: [{delta: {tool_calls: [{index: 0, function: {arguments: 'xt":"hi"}'}}]}}]}
        ])

        const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(contentEvents(events)).toEqual([{toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}])
    })

    it('parses multiple tool calls in one assistant response', async () => {
        mockCreate.mockResolvedValue([
            {choices: [{delta: {tool_calls: [
                {index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"a"}'}},
                {index: 1, id: 'call_2', function: {name: 'echo', arguments: '{"text":"b"}'}}
            ]}}]}
        ])

        const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(contentEvents(events)).toEqual([
            {toolCall: {id: 'call_1', name: 'echo', input: {text: 'a'}}},
            {toolCall: {id: 'call_2', name: 'echo', input: {text: 'b'}}}
        ])
    })

    it('emits a toolCall with argsError when the streamed arguments are not valid JSON', async () => {
        mockCreate.mockResolvedValue([
            {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":'}}]}}]}
        ])

        const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(contentEvents(events)).toHaveLength(1)
        expect(contentEvents(events)[0].toolCall).toMatchObject({id: 'call_1', name: 'echo', input: null})
        expect(contentEvents(events)[0].toolCall.argsError).toBeDefined()
    })

    it('emits text deltas before tool calls when an assistant response has both', async () => {
        mockCreate.mockResolvedValue([
            {choices: [{delta: {content: 'Let me check. '}}]},
            {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"hi"}'}}]}}]}
        ])

        const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

        expect(contentEvents(events)).toEqual([
            {textDelta: 'Let me check. '},
            {toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}
        ])
    })

    describe('per-call response summary', () => {

        it('emits a terminal responseMeta carrying the reasoning char count and finish reason (counts only, never reasoning text)', async () => {
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: 'planning the edit'}}]},
                {choices: [{delta: {content: 'Done.'}}]},
                {choices: [{finish_reason: 'stop', delta: {}}]}
            ])

            const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

            expect(events.at(-1)).toEqual({responseMeta: {reasoningChars: 'planning the edit'.length, finishReason: 'stop'}})
            expect(JSON.stringify(events)).not.toContain('planning the edit')
        })

        it('reports finishReason=length and the burned reasoning count on a reasoning-only length cap', async () => {
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: 'lots of planning'}}]},
                {choices: [{finish_reason: 'length', delta: {}}]}
            ])

            const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'edit'}]}))

            expect(events.at(-1)).toEqual({responseMeta: {reasoningChars: 'lots of planning'.length, finishReason: 'length'}})
        })
    })

    describe('reasoning-only diagnostic', () => {

        function aRecordingBus() {
            const published = []
            return {publish: event => published.push(event), published}
        }

        function reasoningOnly(bus) {
            return bus.published.filter(event => event.type === 'llm.reasoningOnly')
        }

        it('logs the reasoning tail when a call ends reasoning-only with no actionable output (any finish reason)', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: 'The task already looks complete, so I will stop here.'}}]},
                {choices: [{finish_reason: 'stop', delta: {}}]}
            ])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'edit'}],
                debugLabel: 'recipe.update conv-1',
                usageContext: {role: 'specialist', specialist: 'recipe.update', conversationId: 'conv-1'}
            }))

            expect(reasoningOnly(bus)).toHaveLength(1)
            expect(reasoningOnly(bus)[0]).toMatchObject({
                level: 'debug',
                finishReason: 'stop',
                role: 'specialist',
                specialist: 'recipe.update',
                conversationId: 'conv-1'
            })
            expect(reasoningOnly(bus)[0].message()).toContain('I will stop here.')
        })

        it('does not log when the call produced content text', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: 'thinking'}}]},
                {choices: [{delta: {content: 'Done.'}}]},
                {choices: [{finish_reason: 'stop', delta: {}}]}
            ])

            await collect(anOpenAiChat({bus}).respondTo$({messages: [{role: 'user', content: 'hi'}]}))

            expect(reasoningOnly(bus)).toHaveLength(0)
        })

        it('does not log when the call produced an actionable tool call alongside reasoning', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: 'thinking'}}]},
                {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"hi"}'}}]}}]},
                {choices: [{finish_reason: 'tool_calls', delta: {}}]}
            ])

            await collect(anOpenAiChat({bus}).respondTo$({messages: [{role: 'user', content: 'tool'}], tools: toolSchemas}))

            expect(reasoningOnly(bus)).toHaveLength(0)
        })

        it('bounds the reasoning tail to the cap while reporting the full reasoning char count', async () => {
            const bus = aRecordingBus()
            const reasoning = 'HEAD_MARKER' + 'x'.repeat(400) + 'TAIL_MARKER'
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: reasoning}}]},
                {choices: [{finish_reason: 'stop', delta: {}}]}
            ])

            await collect(anOpenAiChat({bus}).respondTo$({messages: [{role: 'user', content: 'edit'}]}))

            const event = reasoningOnly(bus)[0]
            expect(event.reasoningChars).toBe(reasoning.length)
            const text = event.message()
            expect(text).toContain('TAIL_MARKER')
            expect(text).not.toContain('HEAD_MARKER')
        })

        it('fires on a reasoning-only length cap too', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: 'lots of planning'}}]},
                {choices: [{finish_reason: 'length', delta: {}}]}
            ])

            await collect(anOpenAiChat({bus}).respondTo$({messages: [{role: 'user', content: 'edit'}]}))

            expect(reasoningOnly(bus).some(event => event.finishReason === 'length')).toBe(true)
        })
    })

    describe('length-cap observability', () => {

        function aRecordingBus() {
            const published = []
            return {publish: event => published.push(event), published}
        }

        const reasoningOnlyLengthChunks = [
            {choices: [{delta: {reasoning_content: 'planning...'}}]},
            {choices: [{delta: {reasoning_content: 'more planning...'}}]},
            {choices: [{finish_reason: 'length', delta: {}}]}
        ]

        it('retries once when finish_reason=length produced no actionable content or tool call', async () => {
            const bus = aRecordingBus()
            mockCreate
                .mockResolvedValueOnce(reasoningOnlyLengthChunks)
                .mockResolvedValueOnce([{choices: [{delta: {content: 'patched.'}}]}])

            const events = await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'edit'}],
                debugLabel: 'recipe.update conv-1'
            }))

            expect(mockCreate).toHaveBeenCalledTimes(2)
            expect(contentEvents(events)).toEqual([{textDelta: 'patched.'}])
            expect(mockCreate.mock.calls[1][0].messages).toEqual([
                {role: 'user', content: 'edit'},
                {role: 'system', content: expect.stringMatching(/RETRY.*reasoning token budget.*complete tool call.*promptly/i)}
            ])
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

        it('retries instead of emitting a length-capped partial tool call whose required args are missing', async () => {
            mockCreate
                .mockResolvedValueOnce([
                    {choices: [{delta: {reasoning_content: 'planning...'}}]},
                    {choices: [{delta: {tool_calls: [
                        {index: 0, id: 'call_1', function: {name: 'echo', arguments: '{}'}}
                    ]}}]},
                    {choices: [{finish_reason: 'length', delta: {}}]}
                ])
                .mockResolvedValueOnce([
                    {choices: [{delta: {tool_calls: [
                        {index: 0, id: 'call_2', function: {name: 'echo', arguments: '{"text":"hi"}'}}
                    ]}}]}
                ])
            const bus = aRecordingBus()

            const events = await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'tool'}],
                tools: toolSchemas,
                debugLabel: 'recipe.update conv-1'
            }))

            expect(mockCreate).toHaveBeenCalledTimes(2)
            expect(contentEvents(events)).toEqual([{toolCall: {id: 'call_2', name: 'echo', input: {text: 'hi'}}}])
            expect(bus.published.find(event => event.type === 'llm.lengthCap')).toMatchObject({
                empty: false,
                willRetry: true,
                toolCallChunkCount: 1
            })
        })

        it('does not retry a second time when the retry itself also length-caps without an actionable response; both attempts warn, second carries willRetry=false', async () => {
            const bus = aRecordingBus()
            mockCreate
                .mockResolvedValueOnce(reasoningOnlyLengthChunks)
                .mockResolvedValueOnce(reasoningOnlyLengthChunks)

            const events = await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'edit'}],
                debugLabel: 'recipe.update conv-1'
            }))

            expect(mockCreate).toHaveBeenCalledTimes(2)
            expect(contentEvents(events)).toEqual([])
            const lengthCaps = bus.published.filter(event => event.type === 'llm.lengthCap')
            expect(lengthCaps).toHaveLength(2)
            expect(lengthCaps[0]).toMatchObject({attempt: 0, empty: true, willRetry: true})
            expect(lengthCaps[1]).toMatchObject({attempt: 1, empty: true, willRetry: false})
        })

        it('publishes llm.lengthCap with empty=false when partial content was streamed before the length cap', async () => {
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
            expect(contentEvents(events)).toEqual([{textDelta: 'partial '}, {textDelta: 'answer'}])
            expect(bus.published.find(event => event.type === 'llm.lengthCap')).toMatchObject({
                empty: false,
                willRetry: false
            })
        })

        it('publishes llm.lengthCap with empty=false when a tool call was emitted alongside the length cap', async () => {
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
            expect(contentEvents(events)).toEqual([{toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}])
            expect(bus.published.find(event => event.type === 'llm.lengthCap')).toMatchObject({
                empty: false,
                willRetry: false
            })
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

        it('publishes llm.response with attempt=0 on a normal stream so trace consumers can tell first-pass responses apart from retries', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([{choices: [{delta: {content: 'Title'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}],
                debugLabel
            }))

            const response = bus.published.find(event => event.type === 'llm.response')
            expect(response.attempt).toBe(0)
        })

        it('publishes llm.response with attempt=1 on the length-cap retry response', async () => {
            const bus = aRecordingBus()
            mockCreate
                .mockResolvedValueOnce([
                    {choices: [{delta: {reasoning_content: 'planning...'}}]},
                    {choices: [{finish_reason: 'length', delta: {}}]}
                ])
                .mockResolvedValueOnce([{choices: [{delta: {content: 'recovered.'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'edit'}],
                debugLabel
            }))

            const responses = bus.published.filter(event => event.type === 'llm.response')
            expect(responses.map(event => event.attempt)).toEqual([0, 1])
        })

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

    describe('usage accounting', () => {

        function aRecordingBus() {
            const published = []
            return {publish: event => published.push(event), published}
        }

        // now() returns 1000 on the first read (request start) then 1450 (stream end).
        function aStepClock(times) {
            let i = 0
            return {now: () => times[Math.min(i++, times.length - 1)]}
        }

        const usageChunk = {choices: [], usage: {prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050, prompt_tokens_details: {cached_tokens: 800}}}

        it('publishes one llm.usage event with provider-reported tokens, the call dimensions, byte sizes, and duration', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([{choices: [{delta: {content: 'patched.'}}]}, usageChunk])

            await collect(anOpenAiChat({bus, provider: 'lmstudio', clock: aStepClock([1000, 1450])}).respondTo$({
                messages: [{role: 'user', content: 'edit the recipe'}],
                tools: toolSchemas,
                usageContext: {role: 'specialist', specialist: 'recipe.update', conversationId: 'conv-1'}
            }))

            const usage = bus.published.filter(event => event.type === 'llm.usage')
            expect(usage).toHaveLength(1)
            expect(usage[0]).toMatchObject({
                role: 'specialist',
                specialist: 'recipe.update',
                conversationId: 'conv-1',
                provider: 'lmstudio',
                model: 'test-model',
                inputTokens: 1000,
                outputTokens: 50,
                cachedInputTokens: 800,
                usageExact: true,
                cacheUsageExact: true,
                durationMs: 450,
                success: true
            })
            expect(usage[0].toolSchemaBytes).toBeGreaterThan(0)
            expect(usage[0].inputBytes).toBe(usage[0].messageBytes + usage[0].toolSchemaBytes)
        })

        it('falls back to an inexact byte estimate when the provider streams no usage chunk', async () => {
            const bus = aRecordingBus()
            mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}],
                usageContext: {role: 'orchestrator', conversationId: 'conv-1'}
            }))

            const usage = bus.published.find(event => event.type === 'llm.usage')
            expect(usage).toMatchObject({role: 'orchestrator', usageExact: false, cacheUsageExact: false, cachedInputTokens: 0})
            expect(usage.inputTokens).toBeGreaterThan(0)
        })

        it('emits one llm.usage per provider call across a length-cap retry, keeping the same attribution on both', async () => {
            const bus = aRecordingBus()
            mockCreate
                .mockResolvedValueOnce([
                    {choices: [{delta: {reasoning_content: 'planning...'}}]},
                    {choices: [{finish_reason: 'length', delta: {}}]}
                ])
                .mockResolvedValueOnce([{choices: [{delta: {content: 'recovered.'}}]}])

            await collect(anOpenAiChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'edit'}],
                usageContext: {role: 'specialist', specialist: 'recipe.update', conversationId: 'conv-1'}
            }))

            const usage = bus.published.filter(event => event.type === 'llm.usage')
            expect(usage).toHaveLength(2)
            // The retry call must carry the same role/conversation, or its tokens
            // drop out of the real turn/conversation rollups.
            usage.forEach(event => expect(event).toMatchObject({
                role: 'specialist',
                specialist: 'recipe.update',
                conversationId: 'conv-1'
            }))
        })
    })
})
