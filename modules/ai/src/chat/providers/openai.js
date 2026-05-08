const {OpenAICompatibleProvider} = require('./openaiCompatible')
const log = require('#sepal/log').getLogger('providers/openai')

const DEFAULT_MODEL = 'gpt-4o'

class OpenAIProvider extends OpenAICompatibleProvider {
    constructor({apiKey, model, baseUrl}) {
        super({
            apiKey,
            model: model || DEFAULT_MODEL,
            name: 'OpenAI',
            log
        })
        this.baseUrl = baseUrl || undefined
    }

    async _getClient() {
        if (!this.client) {
            const {default: OpenAI} = await import('openai')
            const opts = {apiKey: this.apiKey}
            if (this.baseUrl) {
                opts.baseURL = this.baseUrl
            }
            this.client = new OpenAI(opts)
        }
        return this.client
    }
}

module.exports = {OpenAIProvider}
