import {jest} from '@jest/globals'
import {of} from 'rxjs'

const mockOpenAiRespondTo = jest.fn()
const mockNativeRespondTo = jest.fn()

jest.unstable_mockModule('#mcp/chat/llm/providers/openaiChatCompletions', () => ({
    createOpenAiChatCompletions: jest.fn(() => ({respondTo$: mockOpenAiRespondTo}))
}))
jest.unstable_mockModule('#mcp/chat/llm/providers/lmStudioNativeChat', () => ({
    createLmStudioNativeChat: jest.fn(() => ({respondTo$: mockNativeRespondTo}))
}))

const {createLlm} = await import('#mcp/chat/llm/index')
const {createOpenAiChatCompletions} = await import('#mcp/chat/llm/providers/openaiChatCompletions')
const {createLmStudioNativeChat} = await import('#mcp/chat/llm/providers/lmStudioNativeChat')

describe('LLM provider selector', () => {

    const clock = {now: () => 0}
    const providerConfig = {baseURL: 'http://example.test/v1', apiKey: 'test-key', model: 'test-model', bus: {publish: () => {}}, clock}

    beforeEach(() => {
        createOpenAiChatCompletions.mockClear()
        createLmStudioNativeChat.mockClear()
        mockOpenAiRespondTo.mockReset()
        mockNativeRespondTo.mockReset()
    })

    function aLlm(provider) {
        return createLlm({...providerConfig, provider})
    }

    it('builds both provider adapters, passing the provider name and clock through so usage events are labelled and timed', () => {
        aLlm('lmstudio')

        expect(createOpenAiChatCompletions).toHaveBeenCalledWith(expect.objectContaining({...providerConfig, provider: 'lmstudio'}))
        expect(createLmStudioNativeChat).toHaveBeenCalledWith(expect.objectContaining({...providerConfig, provider: 'lmstudio'}))
    })

    it('routes a non-reasoning lmstudio request to the native chat path', () => {
        const nativeResponse$ = of({textDelta: 'native'})
        mockNativeRespondTo.mockReturnValue(nativeResponse$)
        const request = {messages: [{role: 'user', content: 'hi'}], disableReasoning: true}

        const response$ = aLlm('lmstudio').respondTo$(request)

        expect(response$).toBe(nativeResponse$)
        expect(mockNativeRespondTo).toHaveBeenCalledWith(request)
    })

    it('routes a reasoning lmstudio request to the OpenAI-compatible path', () => {
        const openAiResponse$ = of({textDelta: 'openai'})
        mockOpenAiRespondTo.mockReturnValue(openAiResponse$)
        const request = {messages: [{role: 'user', content: 'hi'}]}

        const response$ = aLlm('lmstudio').respondTo$(request)

        expect(response$).toBe(openAiResponse$)
        expect(mockOpenAiRespondTo).toHaveBeenCalledWith(request)
    })

    it('routes lmstudio tool requests through OpenAI-compatible chat with thinking disabled', () => {
        const openAiResponse$ = of({toolCall: {id: 't1', name: 'echo', input: {text: 'hi'}}})
        mockOpenAiRespondTo.mockReturnValue(openAiResponse$)
        const request = {
            messages: [{role: 'user', content: 'hi'}],
            tools: [{name: 'echo', description: 'Echo.', parameters: {type: 'object'}}]
        }

        const response$ = aLlm('lmstudio').respondTo$(request)

        expect(response$).toBe(openAiResponse$)
        expect(mockOpenAiRespondTo).toHaveBeenCalledWith({
            ...request,
            extraParams: {chat_template_kwargs: {enable_thinking: false}}
        })
    })

    it('does not send structured tool history to the native lmstudio path', () => {
        const openAiResponse$ = of({textDelta: 'done'})
        mockOpenAiRespondTo.mockReturnValue(openAiResponse$)
        const request = {
            messages: [
                {role: 'assistant', content: '', toolCalls: [{id: 't1', name: 'echo', input: {text: 'hi'}}]},
                {role: 'tool', toolResults: [{toolCallId: 't1', toolName: 'echo', result: {ok: true, data: {text: 'hi'}}}]}
            ],
            disableReasoning: true
        }

        aLlm('lmstudio').respondTo$(request)

        expect(mockOpenAiRespondTo).toHaveBeenCalledWith({
            ...request,
            extraParams: {chat_template_kwargs: {enable_thinking: false}}
        })
    })

    it('preserves lmstudio caller extra params when disabling thinking for tool requests', () => {
        mockOpenAiRespondTo.mockReturnValue(of({textDelta: 'done'}))
        const request = {
            messages: [{role: 'user', content: 'hi'}],
            tools: [{name: 'echo', description: 'Echo.', parameters: {type: 'object'}}],
            extraParams: {
                foo: 'bar',
                chat_template_kwargs: {temperature: 0.2, enable_thinking: true}
            }
        }

        aLlm('lmstudio').respondTo$(request)

        expect(mockOpenAiRespondTo).toHaveBeenCalledWith({
            ...request,
            extraParams: {
                foo: 'bar',
                chat_template_kwargs: {temperature: 0.2, enable_thinking: false}
            }
        })
    })

    it('routes non-lmstudio providers to the OpenAI-compatible path even when reasoning is disabled', () => {
        mockOpenAiRespondTo.mockReturnValue(of({textDelta: 'openai'}))
        const request = {messages: [{role: 'user', content: 'hi'}], disableReasoning: true}

        aLlm('openai').respondTo$(request)

        expect(mockOpenAiRespondTo).toHaveBeenCalledWith(request)
    })
})
