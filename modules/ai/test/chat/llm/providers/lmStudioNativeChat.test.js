const {firstValueFrom, toArray} = require('rxjs')

const {createLmStudioNativeChat} = require('#mcp/chat/llm/providers/lmStudioNativeChat')
const {toolSchemas} = require('../providerConformance')
const {aRecordingBus} = require('../../harness')

describe('LM Studio native chat adapter', () => {

    let originalFetch

    beforeEach(() => {
        originalFetch = global.fetch
        global.fetch = jest.fn()
    })

    afterEach(() => {
        global.fetch = originalFetch
    })

    function aNativeChat(overrides = {}) {
        return createLmStudioNativeChat({
            baseURL: 'http://host.docker.internal:1234/v1',
            apiKey: 'test-key',
            model: 'qwen/qwen3.5-9b',
            bus: {publish: () => {}},
            clock: {now: () => 0},
            ...overrides
        })
    }

    function collect(response$) {
        return firstValueFrom(response$.pipe(toArray()))
    }

    function mockNativeReplyOf(text) {
        global.fetch.mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({output: [{type: 'message', content: text}]})
        })
    }

    function mockNativeFailure({status, body}) {
        global.fetch.mockResolvedValue({ok: false, status, text: async () => body})
    }

    it('can be constructed without a baseURL — needed only once a request is made', () => {
        expect(() => aNativeChat({baseURL: undefined})).not.toThrow()
    })

    it('calls the native /api/v1/chat endpoint with reasoning off', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({
                output: [
                    {type: 'reasoning', content: 'ignored'},
                    {type: 'message', content: 'Greeting'}
                ]
            })
        })

        const events = await collect(aNativeChat().respondTo$({
            messages: [
                {role: 'system', content: 'Title only'},
                {role: 'user', content: 'User asked: Hi'}
            ],
            maxTokens: 32,
            temperature: 0
        }))

        expect(events).toEqual([{textDelta: 'Greeting'}])
        expect(global.fetch).toHaveBeenCalledWith(
            'http://host.docker.internal:1234/api/v1/chat',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer test-key'
                }
            })
        )
        expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
            model: 'qwen/qwen3.5-9b',
            input: 'User asked: Hi',
            system_prompt: 'Title only',
            stream: false,
            store: false,
            reasoning: 'off',
            max_output_tokens: 32,
            temperature: 0
        })
    })

    it('joins multiple non-system messages into a role-prefixed native input', async () => {
        mockNativeReplyOf('ok')

        await collect(aNativeChat().respondTo$({
            messages: [
                {role: 'system', content: 'System'},
                {role: 'user', content: 'first'},
                {role: 'assistant', content: 'second'}
            ]
        }))

        const body = JSON.parse(global.fetch.mock.calls[0][1].body)
        expect(body.input).toBe('user: first\n\nassistant: second')
    })

    it('does not send tool schemas — the native path has no tool support', async () => {
        mockNativeReplyOf('ok')

        await collect(aNativeChat().respondTo$({
            messages: [{role: 'user', content: 'hi'}],
            tools: toolSchemas
        }))

        const body = JSON.parse(global.fetch.mock.calls[0][1].body)
        expect(body).not.toHaveProperty('tools')
        expect(body).not.toHaveProperty('tool_choice')
    })

    it('errors the response observable when the native chat endpoint returns a non-OK status', async () => {
        mockNativeFailure({status: 500, body: '{"error":"upstream burst"}'})

        await expect(
            collect(aNativeChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))
        ).rejects.toThrow(/500/)
    })

    describe('with a debugLabel', () => {
        const debugLabel = 'title conv-9'

        it('publishes compact debug request and response summaries without raw response logs', async () => {
            const bus = aRecordingBus()
            mockNativeReplyOf('Title')

            await collect(aNativeChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}], debugLabel
            }))

            const request = bus.published.find(event => event.type === 'llm.request')
            const response = bus.published.find(event => event.type === 'llm.response')
            expect(request.message()).toContain(debugLabel)
            expect(response.message()).toContain(debugLabel)
            expect(response.message()).toContain('contentChunks=1')
        })

        it('does not include the raw user input or raw system prompt in the debug request message', async () => {
            const bus = aRecordingBus()
            const userInput = 'translate-this-to-a-title-please-secret-marker-7193'
            const systemPrompt = 'system-prompt-secret-marker-9821'
            mockNativeReplyOf('Title')

            await collect(aNativeChat({bus}).respondTo$({
                messages: [{role: 'system', content: systemPrompt}, {role: 'user', content: userInput}],
                debugLabel
            }))

            const request = bus.published.find(event => event.type === 'llm.request')
            expect(request.message()).not.toContain(userInput)
            expect(request.message()).not.toContain(systemPrompt)
        })

        it('carries conversationId and a stable callId on llm.request + llm.usage for log-line correlation', async () => {
            const bus = aRecordingBus()
            mockNativeReplyOf('Title')

            await collect(aNativeChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}], debugLabel,
                usageContext: {role: 'title', conversationId: 'conv-9'}
            }))

            const request = bus.published.find(event => event.type === 'llm.request')
            const usage = bus.published.find(event => event.type === 'llm.usage')
            expect(request.callId).toMatch(/^[0-9a-f]+$/)
            expect(usage.callId).toBe(request.callId)
            expect(request.message()).toMatch(/conversationId=conv-9/)
            expect(request.message()).toMatch(new RegExp(`callId=${request.callId}`))
            expect(usage.message()).toMatch(/conversationId=conv-9/)
            expect(usage.message()).toMatch(new RegExp(`callId=${request.callId}`))
        })

        it('publishes the raw input + systemPrompt on llm.requestPayload at trace when full-trace payloads are enabled', async () => {
            const bus = aRecordingBus()
            const {createDiagnostics} = require('#mcp/chat/diagnostics')
            const userInput = 'trace-body-user-input'
            const systemPrompt = 'trace-body-system-prompt'
            mockNativeReplyOf('Title')

            await collect(aNativeChat({bus, diagnostics: createDiagnostics({fullPayloads: true})}).respondTo$({
                messages: [{role: 'system', content: systemPrompt}, {role: 'user', content: userInput}],
                debugLabel
            }))

            const payload = bus.published.find(event => event.type === 'llm.requestPayload')
            expect(payload).toMatchObject({level: 'trace'})
            expect(payload.message()).toContain(userInput)
            expect(payload.message()).toContain(systemPrompt)
        })
    })

    describe('usage accounting', () => {

        function aStepClock(times) {
            let i = 0
            return {now: () => times[Math.min(i++, times.length - 1)]}
        }

        it('publishes one llm.usage event with the call dimensions and duration, estimating tokens when the native response carries no usage', async () => {
            const bus = aRecordingBus()
            mockNativeReplyOf('My Title')

            await collect(aNativeChat({bus, clock: aStepClock([2000, 2300])}).respondTo$({
                messages: [{role: 'user', content: 'name this chat'}],
                usageContext: {role: 'title', conversationId: 'conv-7'}
            }))

            const usage = bus.published.filter(event => event.type === 'llm.usage')
            expect(usage).toHaveLength(1)
            expect(usage[0]).toMatchObject({
                type: 'llm.usage',
                role: 'title',
                conversationId: 'conv-7',
                provider: 'lmstudio',
                model: 'qwen/qwen3.5-9b',
                usageExact: false,
                durationMs: 300,
                success: true
            })
            expect(usage[0].inputTokens).toBeGreaterThan(0)
        })
    })
})
