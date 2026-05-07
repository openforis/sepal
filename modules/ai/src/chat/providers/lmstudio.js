const {LLMProvider} = require('./provider')
const log = require('#sepal/log').getLogger('providers/lmstudio')

const DEFAULT_MODEL = 'local-model'
const MAX_TOKENS = 4096

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
class LMStudioProvider extends LLMProvider {
    constructor({apiKey, model, baseUrl}) {
        super({apiKey: apiKey || 'lm-studio', model: model || DEFAULT_MODEL})
        this.baseUrl = baseUrl
        this.client = null
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

    formatTools(tools) {
        return tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters || {type: 'object', properties: {}}
            }
        }))
    }

    _formatMessages(messages, systemPrompt) {
        const formatted = [{role: 'system', content: systemPrompt}]
        for (const msg of messages) {
            if (msg.role === 'user') {
                formatted.push({role: 'user', content: msg.content})
            } else if (msg.role === 'assistant') {
                const assistantMsg = {role: 'assistant', content: msg.content || null}
                if (msg.toolCalls) {
                    assistantMsg.tool_calls = msg.toolCalls.map(tc => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.input)
                        }
                    }))
                }
                formatted.push(assistantMsg)
            } else if (msg.role === 'tool') {
                for (const tr of msg.toolResults) {
                    formatted.push({
                        role: 'tool',
                        tool_call_id: tr.toolCallId,
                        content: JSON.stringify(tr.result)
                    })
                }
            }
        }
        return formatted
    }

    async chat({messages, tools, systemPrompt}) {
        const client = await this._getClient()
        const formattedMessages = this._formatMessages(messages, systemPrompt)

        const params = {
            model: this.model,
            max_tokens: MAX_TOKENS,
            messages: formattedMessages
        }

        if (tools && tools.length > 0) {
            params.tools = tools
        }

        log.debug(`Calling LM Studio (${this.model}) at ${this.baseUrl} with ${formattedMessages.length} messages, ${(tools || []).length} tools`)

        const response = await client.chat.completions.create(params)
        const choice = response.choices[0]
        const text = choice.message.content || ''
        const toolCalls = (choice.message.tool_calls || []).map(tc => {
            let input
            try {
                input = JSON.parse(tc.function.arguments)
            } catch (_error) {
                log.warn(`Failed to parse tool call arguments for ${tc.function.name}: ${tc.function.arguments}`)
                input = {}
            }
            return {id: tc.id, name: tc.function.name, input}
        })

        log.debug(`LM Studio response: ${text.length} chars text, ${toolCalls.length} tool calls, finish=${choice.finish_reason}`)

        return {text, toolCalls, stopReason: choice.finish_reason}
    }

    async stream({messages, tools, systemPrompt, onChunk}) {
        const client = await this._getClient()
        const formattedMessages = this._formatMessages(messages, systemPrompt)

        const params = {
            model: this.model,
            max_tokens: MAX_TOKENS,
            messages: formattedMessages,
            stream: true
        }

        if (tools && tools.length > 0) {
            params.tools = tools
        }

        log.debug(`Streaming from LM Studio (${this.model}) at ${this.baseUrl} with ${formattedMessages.length} messages, ${(tools || []).length} tools`)

        const stream = await client.chat.completions.create(params)

        let text = ''
        let stopReason = null
        const toolCalls = []
        let currentToolCall = null

        for await (const chunk of stream) {
            const choice = chunk.choices[0]
            const delta = choice.delta

            if (delta.content) {
                text += delta.content
                onChunk(delta.content)
            }

            if (delta.tool_calls) {
                for (const tcDelta of delta.tool_calls) {
                    if (tcDelta.index !== undefined && toolCalls[tcDelta.index]) {
                        currentToolCall = toolCalls[tcDelta.index]
                    } else if (tcDelta.id && tcDelta.function) {
                        toolCalls.push({
                            id: tcDelta.id,
                            name: tcDelta.function.name,
                            input: {},
                            _inputStr: ''
                        })
                        currentToolCall = toolCalls[toolCalls.length - 1]
                    }

                    if (currentToolCall && tcDelta.function && tcDelta.function.arguments) {
                        currentToolCall._inputStr = (currentToolCall._inputStr || '') + tcDelta.function.arguments
                    }
                }
            }

            if (choice.finish_reason) {
                stopReason = choice.finish_reason
            }
        }

        for (const tc of toolCalls) {
            if (tc._inputStr) {
                try {
                    tc.input = JSON.parse(tc._inputStr)
                } catch (_error) {
                    log.warn(`Failed to parse tool call arguments for ${tc.name}: ${tc._inputStr}`)
                }
                delete tc._inputStr
            }
        }

        if (stopReason === 'length') {
            log.warn(`LM Studio stream truncated by max_tokens (${MAX_TOKENS}); ${text.length} chars text, ${toolCalls.length} tool calls`)
        }
        log.debug(`LM Studio stream complete: ${text.length} chars text, ${toolCalls.length} tool calls, finish=${stopReason}`)

        return {text, toolCalls, stopReason}
    }
}

module.exports = {LMStudioProvider}
