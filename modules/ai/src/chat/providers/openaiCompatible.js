const {LLMProvider} = require('./provider')

const MAX_TOKENS = 4096

class OpenAICompatibleProvider extends LLMProvider {
    constructor(options) {
        super(options)
        this.client = null
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

    _buildParams({messages, tools, systemPrompt, stream = false}) {
        const params = {
            model: this.model,
            max_tokens: MAX_TOKENS,
            messages: this._formatMessages(messages, systemPrompt)
        }
        if (stream) params.stream = true
        if (tools && tools.length > 0) params.tools = tools
        return params
    }

    _parseToolCallInput(name, argsStr) {
        try {
            return JSON.parse(argsStr)
        } catch (_error) {
            this.log.warn(`Failed to parse tool call arguments for ${name}: ${argsStr}`)
            return {}
        }
    }

    async _chat(options) {
        const client = await this._getClient()
        const response = await client.chat.completions.create(this._buildParams(options))
        const choice = response.choices[0]
        const text = choice.message.content || ''
        const toolCalls = (choice.message.tool_calls || []).map(tc => ({
            id: tc.id,
            name: tc.function.name,
            input: this._parseToolCallInput(tc.function.name, tc.function.arguments)
        }))
        return {text, toolCalls, stopReason: choice.finish_reason}
    }

    async _stream({messages, tools, systemPrompt, onChunk}) {
        const client = await this._getClient()
        const stream = await client.chat.completions.create(
            this._buildParams({messages, tools, systemPrompt, stream: true})
        )

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
                tc.input = this._parseToolCallInput(tc.name, tc._inputStr)
                delete tc._inputStr
            }
        }

        if (stopReason === 'length') {
            this.log.warn(`${this.name} stream truncated by max_tokens (${MAX_TOKENS}); ${text.length} chars text, ${toolCalls.length} tool calls`)
        }

        return {text, toolCalls, stopReason}
    }

    async _getClient() {
        throw new Error('_getClient() must be implemented by subclass')
    }
}

module.exports = {OpenAICompatibleProvider}
