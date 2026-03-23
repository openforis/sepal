const {LLMProvider} = require('./provider')
const log = require('#sepal/log').getLogger('providers/claude')

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 4096

class ClaudeProvider extends LLMProvider {
    constructor({apiKey, model}) {
        super({apiKey, model: model || DEFAULT_MODEL})
        this.Anthropic = null
        this.client = null
    }

    async _getClient() {
        if (!this.client) {
            // Lazy-load the SDK to avoid requiring it at startup if not used
            const {default: Anthropic} = await import('@anthropic-ai/sdk')
            this.client = new Anthropic({apiKey: this.apiKey})
        }
        return this.client
    }

    formatTools(tools) {
        return tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters || {type: 'object', properties: {}}
        }))
    }

    _formatMessages(messages) {
        const formatted = []
        for (const msg of messages) {
            if (msg.role === 'user') {
                formatted.push({role: 'user', content: msg.content})
            } else if (msg.role === 'assistant') {
                const content = []
                if (msg.content) {
                    content.push({type: 'text', text: msg.content})
                }
                if (msg.toolCalls) {
                    for (const tc of msg.toolCalls) {
                        content.push({
                            type: 'tool_use',
                            id: tc.id,
                            name: tc.name,
                            input: tc.input
                        })
                    }
                }
                formatted.push({role: 'assistant', content})
            } else if (msg.role === 'tool') {
                const content = msg.toolResults.map(tr => ({
                    type: 'tool_result',
                    tool_use_id: tr.toolCallId,
                    content: JSON.stringify(tr.result)
                }))
                formatted.push({role: 'user', content})
            }
        }
        return formatted
    }

    async chat({messages, tools, systemPrompt}) {
        const client = await this._getClient()
        const formattedMessages = this._formatMessages(messages)

        const params = {
            model: this.model,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: formattedMessages
        }

        if (tools && tools.length > 0) {
            params.tools = tools
        }

        log.debug(`Calling Claude (${this.model}) with ${formattedMessages.length} messages, ${(tools || []).length} tools`)

        const response = await client.messages.create(params)

        let text = ''
        const toolCalls = []

        for (const block of response.content) {
            if (block.type === 'text') {
                text += block.text
            } else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    name: block.name,
                    input: block.input
                })
            }
        }

        log.debug(`Claude response: ${text.length} chars text, ${toolCalls.length} tool calls, stop=${response.stop_reason}`)

        return {text, toolCalls}
    }

    async stream({messages, tools, systemPrompt, onChunk}) {
        const client = await this._getClient()
        const formattedMessages = this._formatMessages(messages)

        const params = {
            model: this.model,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: formattedMessages
        }

        if (tools && tools.length > 0) {
            params.tools = tools
        }

        log.debug(`Streaming from Claude (${this.model}) with ${formattedMessages.length} messages, ${(tools || []).length} tools`)

        const stream = await client.messages.stream(params)

        let text = ''
        const toolCalls = []

        for await (const event of stream) {
            if (event.type === 'content_block_delta') {
                if (event.delta.type === 'text_delta') {
                    const chunk = event.delta.text
                    text += chunk
                    onChunk(chunk)
                } else if (event.delta.type === 'input_json_delta') {
                    const currentTc = toolCalls[toolCalls.length - 1]
                    if (currentTc) {
                        currentTc._inputStr = (currentTc._inputStr || '') + event.delta.partial_json
                    }
                }
            } else if (event.type === 'content_block_start') {
                if (event.content_block.type === 'tool_use') {
                    toolCalls.push({
                        id: event.content_block.id,
                        name: event.content_block.name,
                        input: {},
                        _inputStr: ''
                    })
                }
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

        log.debug(`Claude stream complete: ${text.length} chars text, ${toolCalls.length} tool calls`)

        return {text, toolCalls}
    }
}

module.exports = {ClaudeProvider}
