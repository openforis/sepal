const {truncateTo, MAX_DEBUG_TEXT} = require('../llm/common/text')

function publishLlmRequest({bus, conversationId, round, llmMessages, toolSchemas}) {
    const offeredTools = toolSchemas.map(tool => tool.name)
    bus.publish({
        type: 'conversation.llmRequest',
        level: 'debug',
        conversationId,
        round,
        messageCount: llmMessages.length,
        offeredTools,
        message: `LLM turn ${conversationId} round=${round} messages=${messageSummary(llmMessages)} tools=[${offeredTools.join(',')}]`
    })
    bus.publish({
        type: 'conversation.llmMessages',
        level: 'trace',
        conversationId,
        round,
        message: () => `LLM turn ${conversationId} round=${round} messages payload: ${truncateJson(llmMessages)}`
    })
    bus.publish({
        type: 'conversation.llmTools',
        level: 'trace',
        conversationId,
        round,
        message: () => `LLM turn ${conversationId} round=${round} tools payload: ${truncateJson(toolSchemas)}`
    })
}

function publishToolCall({bus, conversationId, round, toolCall}) {
    bus.publish({
        type: 'conversation.llmToolCall',
        level: 'debug',
        conversationId,
        round,
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        message: `LLM turn ${conversationId} round=${round} requested tool ${toolCall.name} (${toolCall.id})`
    })
    bus.publish({
        type: 'conversation.llmToolCallPayload',
        level: 'trace',
        conversationId,
        round,
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        message: () => `LLM turn ${conversationId} round=${round} tool call payload: ${truncateJson(toolCall)}`
    })
}

function publishHistoryProjection({bus, conversationId, projection}) {
    if (!projection) return
    const {before, after} = projection
    bus.publish({
        type: 'conversation.historyProjection',
        level: 'debug',
        conversationId,
        beforeCount: before.length,
        afterCount: after.length,
        message: `LLM history projection ${conversationId}: completed messages ${before.length} -> ${after.length}`
    })
    bus.publish({
        type: 'conversation.historyProjectionPayload',
        level: 'trace',
        conversationId,
        message: () => `LLM history projection ${conversationId} before=${truncateJson(before)} after=${truncateJson(after)}`
    })
}

function messageSummary(messages) {
    return messages.map(message => {
        if (message.role === 'assistant' && message.toolCalls) {
            return `assistant(toolCalls=${message.toolCalls.map(tool => tool.name).join('|')})`
        }
        if (message.role === 'tool') {
            return `tool(${message.toolResults?.map(result => `${result.toolName}:${result.result?.ok ? 'ok' : 'failed'}`).join('|') || 0})`
        }
        const contentLength = typeof message.content === 'string' ? message.content.length : 0
        return `${message.role}(${contentLength})`
    }).join(' -> ')
}

function truncateJson(value) {
    return truncateTo(JSON.stringify(value), MAX_DEBUG_TEXT)
}

module.exports = {publishLlmRequest, publishToolCall, publishHistoryProjection}
