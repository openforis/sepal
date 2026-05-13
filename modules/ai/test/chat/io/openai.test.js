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

const {createOpenAI} = require('#mcp/chat/io/openai')

describe('OpenAI-compatible adapter', () => {

    let originalFetch

    beforeEach(() => {
        mockCreate.mockReset()
        originalFetch = global.fetch
        global.fetch = jest.fn()
    })

    afterEach(() => {
        global.fetch = originalFetch
    })

    it('passes bounded generation and provider-specific extra params', async () => {
        mockCreate.mockResolvedValue([
            {choices: [{delta: {content: 'Title'}}]}
        ])
        const openai = createOpenAI({
            baseURL: 'http://example.test/v1',
            apiKey: 'test-key',
            model: 'test-model',
            bus: {publish: () => {}}
        })

        const events = await firstValueFrom(openai.respondTo$({
            messages: [{role: 'user', content: 'hello'}],
            maxTokens: 32,
            temperature: 0,
            extraParams: {
                chat_template_kwargs: {enable_thinking: false}
            }
        }).pipe(toArray()))

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

    it('uses LM Studio native chat with reasoning off for non-reasoning requests', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({
                output: [
                    {type: 'reasoning', content: 'ignored'},
                    {type: 'message', content: 'Greeting'}
                ],
                stats: {reasoning_output_tokens: 0}
            })
        })
        const openai = createOpenAI({
            baseURL: 'http://host.docker.internal:1234/v1',
            apiKey: 'test-key',
            model: 'qwen/qwen3.5-9b',
            provider: 'lmstudio',
            bus: {publish: () => {}}
        })

        const events = await firstValueFrom(openai.respondTo$({
            messages: [
                {role: 'system', content: 'Title only'},
                {role: 'user', content: 'User asked: Hi'}
            ],
            maxTokens: 32,
            temperature: 0,
            disableReasoning: true
        }).pipe(toArray()))

        expect(events).toEqual([{textDelta: 'Greeting'}])
        expect(mockCreate).not.toHaveBeenCalled()
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
})
