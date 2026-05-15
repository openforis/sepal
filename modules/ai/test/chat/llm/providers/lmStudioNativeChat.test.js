const {firstValueFrom, toArray} = require('rxjs')

const {createLmStudioNativeChat} = require('#mcp/chat/llm/providers/lmStudioNativeChat')
const {toolSchemas} = require('../providerConformance')

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
            ...overrides
        })
    }

    function collect(response$) {
        return firstValueFrom(response$.pipe(toArray()))
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

    it('does not send tool schemas — the native path has no tool support', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({output: [{type: 'message', content: 'ok'}]})
        })

        await collect(aNativeChat().respondTo$({
            messages: [{role: 'user', content: 'hi'}],
            tools: toolSchemas
        }))

        const body = JSON.parse(global.fetch.mock.calls[0][1].body)
        expect(body).not.toHaveProperty('tools')
        expect(body).not.toHaveProperty('tool_choice')
    })

    it('errors the response observable when the native chat endpoint returns a non-OK status', async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => '{"error":"upstream burst"}'
        })

        await expect(
            collect(aNativeChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))
        ).rejects.toThrow(/500/)
    })

    describe('with a debugLabel', () => {
        const debugLabel = 'title conv-9'

        function aRecordingBus() {
            const published = []
            return {publish: event => published.push(event), published}
        }

        it('publishes a debug llm.request and a trace llm.debugResponse so debug logs can correlate request and response', async () => {
            const bus = aRecordingBus()
            global.fetch.mockResolvedValue({
                ok: true,
                text: async () => JSON.stringify({output: [{type: 'message', content: 'Title'}]})
            })

            await collect(aNativeChat({bus}).respondTo$({
                messages: [{role: 'user', content: 'hi'}],
                debugLabel
            }))

            const request = bus.published.find(event => event.type === 'llm.request')
            const response = bus.published.find(event => event.type === 'llm.debugResponse')
            expect(request).toMatchObject({level: 'debug'})
            expect(request.message()).toContain(debugLabel)
            expect(response).toMatchObject({level: 'trace'})
            expect(response.message()).toContain(debugLabel)
        })
    })
})
