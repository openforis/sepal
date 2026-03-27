const {ClaudeProvider} = require('./providers/claude')
const {OpenAIProvider} = require('./providers/openai')
const {LMStudioProvider} = require('./providers/lmstudio')
const {readFileSync} = require('fs')
const {join} = require('path')

const SYSTEM_PROMPT_TEMPLATE = readFileSync(join(__dirname, 'system-prompt.md'), 'utf-8')

const log = require('#sepal/log').getLogger('provider')

const createProvider = ({llmProvider, llmApiKey, llmModel, llmBaseUrl}) => {
    switch (llmProvider) {
        case 'claude':
            return new ClaudeProvider({apiKey: llmApiKey, model: llmModel})
        case 'openai':
            return new OpenAIProvider({apiKey: llmApiKey, model: llmModel, baseUrl: llmBaseUrl})
        case 'lmstudio':
            return new LMStudioProvider({apiKey: llmApiKey, model: llmModel, baseUrl: llmBaseUrl})
        default:
            log.warn(`Unknown LLM provider "${llmProvider}", defaulting to claude`)
            return new ClaudeProvider({apiKey: llmApiKey, model: llmModel})
    }
}

const getLLM = ({config, registry}) => {
    if (config.llmApiKey) {
        const provider = createProvider(config)
        log.info(`Using provider "${config.llmProvider}", model "${provider.model}"`)
        if (registry) {
            const tools = registry.listTools()
            const formattedTools = provider.formatTools(tools)
            log.info(`Provider initialized: ${config.llmProvider}, ${tools.length} tools registered`)
            return {provider, formattedTools}
        } else {
            log.info(`Provider initialized: ${config.llmProvider}, no tools registered`)
            return {provider, formattedTools: []}
        }
    } else {
        log.warn('No LLM API key configured, chat will use echo mode')
        return {}
    }
}

const buildSystemPrompt = ({username, registry}) => {
    const recipeTypes = registry
        ? registry.listSchemas().map(s => `- **${s.name}** (${s.id}): ${s.description}`).join('\n')
        : 'No recipe schemas loaded yet.'

    return SYSTEM_PROMPT_TEMPLATE
        .replace('{{username}}', username)
        .replace('{{recipeTypes}}', recipeTypes)
}

module.exports = {getLLM, buildSystemPrompt}
