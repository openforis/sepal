// Bus event publishers for conversation telemetry.

function publishLlmRequest({bus, diagnostics, conversationId, round, llmMessages, toolSchemas}) {
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
        message: () => `LLM turn ${conversationId} round=${round} messages payload: ${diagnostics.summarizeMessages(llmMessages)}`
    })
    bus.publish({
        type: 'conversation.llmTools',
        level: 'trace',
        conversationId,
        round,
        message: () => `LLM turn ${conversationId} round=${round} tools payload: ${diagnostics.summarizeTools(toolSchemas)}`
    })
}

function publishToolCall({bus, diagnostics, conversationId, round, toolCall}) {
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
        message: () => `LLM turn ${conversationId} round=${round} tool call payload: ${diagnostics.summarizeObject(toolCall)}`
    })
}

function publishEmptyLlmRetry({bus, conversationId, round, messages, exposedTools}) {
    const roleSummary = roleSummaryOf(messages)
    bus.publish({
        type: 'conversation.llmEmptyRetry',
        level: 'info',
        conversationId,
        round,
        afterToolRound: isAfterToolRound(messages),
        roleSummary,
        exposedTools,
        message: `LLM turn ${conversationId} round=${round} retrying with hint after empty post-tool reply roles=[${roleSummary}] tools=[${exposedTools.join(',') || '-'}]`
    })
}

function publishRetryToolCallsDropped({bus, conversationId, round, toolCalls}) {
    const names = toolCalls.map(toolCall => toolCall.name).join('|')
    bus.publish({
        type: 'conversation.llmRetryToolCallsDropped',
        level: 'warn',
        conversationId,
        round,
        toolNames: toolCalls.map(toolCall => toolCall.name),
        message: `LLM turn ${conversationId} round=${round} dropped tool calls on retry (text-only contract): [${names}]`
    })
}

function publishEmptyLlmReply({bus, conversationId, round, messages, exposedTools}) {
    const afterToolRound = isAfterToolRound(messages)
    const toolResults = afterToolRound ? messages.at(-1).toolResults || [] : []
    const toolSummary = toolResults.map(toolResultSummary).join(',') || '-'
    const roleSummary = roleSummaryOf(messages)
    const requestedToolCalls = lastAssistantToolCallNames(messages)
    bus.publish({
        type: 'conversation.llmEmptyReply',
        level: 'warn',
        conversationId,
        round,
        afterToolRound,
        toolSummary,
        roleSummary,
        exposedTools,
        requestedToolCalls,
        message: `LLM turn ${conversationId} round=${round} produced no visible assistant text afterToolRound=${afterToolRound} toolResults=[${toolSummary}] roles=[${roleSummary}] tools=[${exposedTools.join(',') || '-'}] requested=[${requestedToolCalls.join(',') || '-'}]`
    })
}

function publishHistoryProjection({bus, diagnostics, conversationId, projection}) {
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
        message: () => `LLM history projection ${conversationId} before=${diagnostics.summarizeMessages(before)} after=${diagnostics.summarizeMessages(after)}`
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

function roleSummaryOf(messages) {
    return messages.map(roleToken).join('|')
}

function roleToken(message) {
    if (message.role === 'assistant' && message.toolCalls) {
        return `assistant.toolCalls(${message.toolCalls.map(toolCall => toolCall.name).join('|')})`
    }
    if (message.role === 'tool') {
        return `tool(${(message.toolResults || []).map(toolResultSummary).join('|') || '-'})`
    }
    const length = typeof message.content === 'string' ? message.content.length : 0
    return `${message.role}(${length})`
}

function lastAssistantToolCallNames(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i]
        if (message.role === 'assistant' && message.toolCalls) {
            return message.toolCalls.map(toolCall => toolCall.name)
        }
    }
    return []
}

function isAfterToolRound(messages) {
    return messages.at(-1)?.role === 'tool'
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

module.exports = {publishLlmRequest, publishToolCall, publishEmptyLlmReply, publishEmptyLlmRetry, publishRetryToolCallsDropped, publishHistoryProjection}
