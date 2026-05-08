class LLMProvider {
    constructor({apiKey, model, name, log}) {
        this.apiKey = apiKey
        this.model = model
        this.name = name
        this.log = log
    }

    async chat(options) {
        const t = Date.now()
        this.log.debug(`Calling ${this.name} (${this.model}) with ${options.messages.length} messages, ${(options.tools || []).length} tools`)
        try {
            const result = await this._chat(options)
            this.log.debug(`${this.name} response: ${result.text.length} chars text, ${result.toolCalls.length} tool calls, stop=${result.stopReason} (${Date.now() - t}ms)`)
            return result
        } catch (error) {
            this.log.debug(`${this.name} chat failed after ${Date.now() - t}ms`)
            throw error
        }
    }

    async stream(options) {
        const t = Date.now()
        this.log.debug(`Streaming from ${this.name} (${this.model}) with ${options.messages.length} messages, ${(options.tools || []).length} tools`)
        try {
            const result = await this._stream(options)
            this.log.debug(`${this.name} stream complete: ${result.text.length} chars text, ${result.toolCalls.length} tool calls, stop=${result.stopReason} (${Date.now() - t}ms)`)
            return result
        } catch (error) {
            this.log.debug(`${this.name} stream failed after ${Date.now() - t}ms`)
            throw error
        }
    }

    formatTools(_tools) {
        throw new Error('formatTools() must be implemented by subclass')
    }

    async _chat(_options) {
        throw new Error('_chat() must be implemented by subclass')
    }

    async _stream(_options) {
        throw new Error('_stream() must be implemented by subclass')
    }
}

module.exports = {LLMProvider}
