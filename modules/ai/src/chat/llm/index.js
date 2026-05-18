// LLM port for the rest of chat. createLlm() picks a provider adapter
// from config.provider and exposes a single respondTo$ method so
// Conversation and titleGenerator don't see provider differences.

const {createOpenAiChatCompletions} = require('./providers/openaiChatCompletions')
const {createLmStudioNativeChat} = require('./providers/lmStudioNativeChat')

// Provider-neutral LLM port. conversation.js / titleGenerator.js depend only on
// respondTo$, never on a provider's wire shape.
//
//   respondTo$({messages, tools, maxTokens, temperature, debugLabel, extraParams, disableReasoning})
//     -> stream of {textDelta} and {toolCall: {id, name, input, argsError?}}
//
// LM Studio's native /api/v1/chat path is the only way to fully suppress a
// reasoning phase, so non-reasoning requests against an lmstudio provider route
// there; every other request goes through the OpenAI-compatible path.
function createLlm({baseURL, apiKey, model, provider, bus}) {
    const providerConfig = {baseURL, apiKey, model, bus}
    const openAiChat = createOpenAiChatCompletions(providerConfig)
    const lmStudioNativeChat = createLmStudioNativeChat(providerConfig)

    return {respondTo$}

    function respondTo$(request) {
        const useLmStudioNativePath = provider === 'lmstudio' && request.disableReasoning
        return useLmStudioNativePath
            ? lmStudioNativeChat.respondTo$(request)
            : openAiChat.respondTo$(request)
    }
}

module.exports = {createLlm}
