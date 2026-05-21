// LLM port for the rest of chat. createLlm() picks a provider adapter
// from config.provider and exposes a single respondTo$ method so
// Conversation and titleGenerator don't see provider differences.

const {createOpenAiChatCompletions} = require('./providers/openaiChatCompletions')
const {createLmStudioNativeChat} = require('./providers/lmStudioNativeChat')

function createLlm({baseURL, apiKey, model, provider, bus, clock, diagnostics}) {
    const providerConfig = {baseURL, apiKey, model, provider, bus, clock, diagnostics}
    const openAiChat = createOpenAiChatCompletions(providerConfig)
    const lmStudioNativeChat = createLmStudioNativeChat(providerConfig)

    return {respondTo$}

    function respondTo$(request) {
        // LM Studio's native /api/v1/chat is the strongest no-reasoning path,
        // but it cannot preserve OpenAI-style tool calls/results.
        const useLmStudioNativePath = provider === 'lmstudio'
            && request.disableReasoning
            && !hasStructuredToolTraffic(request)
        return useLmStudioNativePath
            ? lmStudioNativeChat.respondTo$(request)
            : openAiChat.respondTo$(requestForOpenAiChat(request))
    }

    function requestForOpenAiChat(request) {
        return provider === 'lmstudio' && hasStructuredToolTraffic(request)
            ? withLmStudioThinkingDisabled(request)
            : request
    }
}

function hasStructuredToolTraffic({messages = [], tools = []} = {}) {
    return tools.length > 0 || messages.some(message =>
        message.role === 'tool' || Boolean(message.toolCalls)
    )
}

function withLmStudioThinkingDisabled(request) {
    const extraParams = request.extraParams || {}
    return {
        ...request,
        extraParams: {
            ...extraParams,
            chat_template_kwargs: {
                ...objectOrEmpty(extraParams.chat_template_kwargs),
                enable_thinking: false
            }
        }
    }
}

function objectOrEmpty(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

module.exports = {createLlm}
