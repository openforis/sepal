/**
 * Base LLM provider interface.
 *
 * Subclasses must implement:
 * - formatTools(tools) — convert MCP tool defs to provider-specific format
 * - chat({messages, tools, systemPrompt}) — call the LLM and return {text, toolCalls}
 */
class LLMProvider {
    constructor({apiKey, model}) {
        this.apiKey = apiKey
        this.model = model
    }

    /**
     * Convert MCP tool definitions to provider-specific format.
     * @param {Array<{name, description, parameters}>} tools
     * @returns {Array} provider-formatted tools
     */
    formatTools(_tools) {
        throw new Error('formatTools() must be implemented by subclass')
    }

    /**
     * Send messages to the LLM and return a response.
     * @param {Object} options
     * @param {Array<{role, content, toolCalls?, toolResults?}>} options.messages
     * @param {Array} options.tools - provider-formatted tools
     * @param {string} options.systemPrompt
     * @returns {Promise<{text: string, toolCalls: Array<{id, name, input}>}>}
     */
    async chat(_options) {
        throw new Error('chat() must be implemented by subclass')
    }

    /**
     * Stream messages from the LLM, yielding text chunks.
     * @param {Object} options
     * @param {Array<{role, content, toolCalls?, toolResults?}>} options.messages
     * @param {Array} options.tools - provider-formatted tools
     * @param {string} options.systemPrompt
     * @param {Function} options.onChunk - called with each text chunk
     * @returns {Promise<{text: string, toolCalls: Array<{id, name, input}>}>}
     */
    async stream(_options) {
        throw new Error('stream() must be implemented by subclass')
    }
}

module.exports = {LLMProvider}
