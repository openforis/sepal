// Bus event publishers for conversation telemetry: the projected LLM
// message history for a turn, the LLM request being sent, and each tool
// call before invocation. Separated from conversation.js to keep the
// turn loop readable.

const {truncateTo, MAX_DEBUG_TEXT} = require('../debugText')

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

function publishEmptyLlmReply({bus, conversationId, round, messages}) {
    const afterToolRound = messages.at(-1)?.role === 'tool'
    const toolResults = afterToolRound ? messages.at(-1).toolResults || [] : []
    const toolSummary = toolResults.map(toolResultSummary).join(',') || '-'
    bus.publish({
        type: 'conversation.llmEmptyReply',
        level: 'warn',
        conversationId,
        round,
        afterToolRound,
        toolSummary,
        message: `LLM turn ${conversationId} round=${round} produced no visible assistant text afterToolRound=${afterToolRound} toolResults=[${toolSummary}]`
    })
    bus.publish({
        type: 'conversation.llmEmptyReplyContext',
        level: 'trace',
        conversationId,
        round,
        message: () => `LLM empty reply ${conversationId} round=${round} recent messages: ${truncateJson(messages.slice(-4))}`
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

function toolResultSummary({toolName, result}) {
    if (!result) return `${toolName}:missing`
    if (result.ok === false) return `${toolName}:failed:${result.error?.code || 'unknown'}`
    const data = result.data
    const answerLength = typeof data?.answer === 'string' ? data.answer.length : null
    if (answerLength !== null) return `${toolName}:ok:answer(${answerLength})`
    if (Array.isArray(data)) return `${toolName}:ok:array(${data.length})`
    if (isPlainObject(data)) return `${toolName}:ok:keys(${Object.keys(data).join('|')})`
    return `${toolName}:ok:${data == null ? 'null' : typeof data}`
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function truncateJson(value) {
    return truncateTo(JSON.stringify(value), MAX_DEBUG_TEXT)
}

module.exports = {publishLlmRequest, publishToolCall, publishEmptyLlmReply, publishHistoryProjection}
