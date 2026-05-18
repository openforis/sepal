// LLM port for the rest of chat. createLlm() picks a provider adapter
// from config.provider and exposes a single respondTo$ method so
// Conversation and titleGenerator don't see provider differences.

const {createOpenAiChatCompletions} = require('./providers/openaiChatCompletions')
const {createLmStudioNativeChat} = require('./providers/lmStudioNativeChat')

function createLlm({baseURL, apiKey, model, provider, bus, diagnostics}) {
    const providerConfig = {baseURL, apiKey, model, bus, diagnostics}
    const openAiChat = createOpenAiChatCompletions(providerConfig)
    const lmStudioNativeChat = createLmStudioNativeChat(providerConfig)

    return {respondTo$}

    function respondTo$(request) {
        // LM Studio's native /api/v1/chat is the only path that fully
        // suppresses a reasoning phase; everything else goes through the
        // OpenAI-compatible path.
        const useLmStudioNativePath = provider === 'lmstudio' && request.disableReasoning
        return useLmStudioNativePath
            ? lmStudioNativeChat.respondTo$(request)
            : openAiChat.respondTo$(request)
    }
}

module.exports = {createLlm}
