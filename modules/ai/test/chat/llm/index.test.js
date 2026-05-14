const {of} = require('rxjs')

const mockOpenAiRespondTo = jest.fn()
const mockNativeRespondTo = jest.fn()

jest.mock('#mcp/chat/llm/providers/openaiChatCompletions', () => ({
    createOpenAiChatCompletions: jest.fn(() => ({respondTo$: mockOpenAiRespondTo}))
}))
jest.mock('#mcp/chat/llm/providers/lmStudioNativeChat', () => ({
    createLmStudioNativeChat: jest.fn(() => ({respondTo$: mockNativeRespondTo}))
}))

const {createLlm} = require('#mcp/chat/llm/index')
const {createOpenAiChatCompletions} = require('#mcp/chat/llm/providers/openaiChatCompletions')
const {createLmStudioNativeChat} = require('#mcp/chat/llm/providers/lmStudioNativeChat')

describe('LLM provider selector', () => {

    const providerConfig = {baseURL: 'http://example.test/v1', apiKey: 'test-key', model: 'test-model', bus: {publish: () => {}}}

    beforeEach(() => {
        createOpenAiChatCompletions.mockClear()
        createLmStudioNativeChat.mockClear()
        mockOpenAiRespondTo.mockReset()
        mockNativeRespondTo.mockReset()
    })

    function aLlm(provider) {
        return createLlm({...providerConfig, provider})
    }

    it('builds both provider adapters from the shared provider config', () => {
        aLlm('lmstudio')

        expect(createOpenAiChatCompletions).toHaveBeenCalledWith(providerConfig)
        expect(createLmStudioNativeChat).toHaveBeenCalledWith(providerConfig)
    })

    it('routes a non-reasoning lmstudio request to the native chat path', () => {
        const nativeResponse$ = of({textDelta: 'native'})
        mockNativeRespondTo.mockReturnValue(nativeResponse$)
        const request = {messages: [{role: 'user', content: 'hi'}], disableReasoning: true}

        const response$ = aLlm('lmstudio').respondTo$(request)

        expect(response$).toBe(nativeResponse$)
        expect(mockNativeRespondTo).toHaveBeenCalledWith(request)
        expect(mockOpenAiRespondTo).not.toHaveBeenCalled()
    })

    it('routes a reasoning lmstudio request to the OpenAI-compatible path', () => {
        const openAiResponse$ = of({textDelta: 'openai'})
        mockOpenAiRespondTo.mockReturnValue(openAiResponse$)
        const request = {messages: [{role: 'user', content: 'hi'}]}

        const response$ = aLlm('lmstudio').respondTo$(request)

        expect(response$).toBe(openAiResponse$)
        expect(mockOpenAiRespondTo).toHaveBeenCalledWith(request)
        expect(mockNativeRespondTo).not.toHaveBeenCalled()
    })

    it('routes non-lmstudio providers to the OpenAI-compatible path even when reasoning is disabled', () => {
        mockOpenAiRespondTo.mockReturnValue(of({textDelta: 'openai'}))
        const request = {messages: [{role: 'user', content: 'hi'}], disableReasoning: true}

        aLlm('openai').respondTo$(request)

        expect(mockOpenAiRespondTo).toHaveBeenCalledWith(request)
        expect(mockNativeRespondTo).not.toHaveBeenCalled()
    })
})
