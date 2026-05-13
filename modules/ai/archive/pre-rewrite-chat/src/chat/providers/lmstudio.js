const {OpenAICompatibleProvider} = require('./openaiCompatible')
const log = require('#sepal/log').getLogger('providers/lmstudio')

const DEFAULT_MODEL = 'local-model'

/**
 * OpenAI-compatible provider with a configurable base URL.
 * Designed for locally-deployed LM Studio (or any OpenAI-compatible endpoint
 * such as Ollama, LocalAI, vLLM, etc.).
 *
 * LM Studio exposes: http://<host>:<port>/v1  (default: http://localhost:1234/v1)
 *
 * Configure via:
 *   --llm-provider lmstudio
 *   --llm-base-url http://localhost:1234/v1
 *   --llm-model <model-name-as-shown-in-lmstudio>
 *
 * The API key is optional for local deployments; pass any non-empty string
 * (e.g. "lm-studio") if the endpoint requires an Authorization header.
 */
class LMStudioProvider extends OpenAICompatibleProvider {
    constructor({apiKey, model, baseUrl}) {
        super({
            apiKey: apiKey || 'lm-studio',
            model: model || DEFAULT_MODEL,
            name: 'LM Studio',
            log
        })
        this.baseUrl = baseUrl
    }

    async _getClient() {
        if (!this.client) {
            const {default: OpenAI} = await import('openai')
            this.client = new OpenAI({
                apiKey: this.apiKey,
                baseURL: this.baseUrl,
                // Local deployments typically use self-signed certs or plain HTTP;
                // the Node.js OpenAI SDK honours the standard NODE_TLS_REJECT_UNAUTHORIZED
                // env var, so TLS verification can be disabled externally if needed.
            })
        }
        return this.client
    }
}

module.exports = {LMStudioProvider}
