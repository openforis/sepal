// Bus event publishers for conversation telemetry.

const {publishLoopPrompt} = require('../loopEvents')
const {textChunk} = require('../diagnostics')

function publishOrchestratorPrompt({bus, conversationId, round, llmMessages, toolSchemas}) {
    publishLoopPrompt({bus, prefix: 'orchestrator', conversationId, round, messages: llmMessages, toolSchemas})
}

function publishLlmRequest({bus, diagnostics, conversationId, round, llmMessages, toolSchemas}) {
    const offeredTools = toolSchemas.map(tool => tool.name)
    bus.publish({
        type: 'conversation.llmRequest',
        level: 'debug',
        conversationId,
        round,
        messageCount: llmMessages.length,
        offeredTools,
        message: `LLM orchestrator ${conversationId} round=${round} messages=${messageSummary(llmMessages)} tools=[${offeredTools.join(',')}]`
    })
    bus.publish({
        type: 'conversation.llmRequestPayload',
        level: 'trace',
        conversationId,
        round,
        message: () => `LLM orchestrator ${conversationId} round=${round} payload:`
            + ` messages=${diagnostics.summarizeMessages(llmMessages)}`
            + ` tools=${diagnostics.summarizeTools(toolSchemas)}`
    })
}

function publishToolCall({bus, diagnostics, conversationId, round, toolCall}) {
    const inputSummary = summariseToolCallInput(toolCall)
    bus.publish({
        type: 'conversation.llmToolCall',
        level: 'debug',
        conversationId,
        round,
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        inputSummary,
        message: `LLM orchestrator ${conversationId} round=${round} requested tool ${toolCall.name} (${toolCall.id})${inputSummary ? ` ${inputSummary}` : ''}`
    })
    bus.publish({
        type: 'conversation.llmToolCallPayload',
        level: 'trace',
        conversationId,
        round,
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        message: () => `LLM orchestrator ${conversationId} round=${round} tool call payload: ${diagnostics.summarizeObject(toolCall)}`
    })
}

function summariseToolCallInput(toolCall) {
    const input = toolCall?.input
    if (!input || typeof input !== 'object') return ''
    switch (toolCall.name) {
        case 'update_recipe': return summariseUpdateRecipe(input)
        case 'describe_recipe': return summariseDescribeRecipe(input)
        case 'create_recipe': return summariseCreateRecipe(input)
        default: return summariseGeneric(input)
    }
}

function summariseUpdateRecipe(input) {
    const intent = input.request ?? input.instruction
    const parts = [`recipeId=${input.recipeId || '-'}`, ...textChunk('request', intent)]
    if (hasText(input.context)) parts.push(...textChunk('context', input.context))
    return parts.join(' ')
}

function summariseDescribeRecipe(input) {
    const parts = [`recipeId=${input.recipeId || '-'}`]
    if (hasText(input.question)) parts.push(...textChunk('question', input.question))
    return parts.join(' ')
}

function summariseCreateRecipe(input) {
    const intent = input.request ?? input.instruction
    const parts = [`recipeType=${input.recipeType || '-'}`, ...textChunk('request', intent)]
    if (hasText(input.projectId)) parts.push(`projectId=${input.projectId}`)
    if (hasText(input.name)) parts.push(`name=${input.name}`)
    return parts.join(' ')
}

function summariseGeneric(input) {
    const keys = Object.keys(input)
    return keys.length ? `inputKeys=[${keys.join(',')}]` : ''
}

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0
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
        message: `LLM orchestrator ${conversationId} round=${round} retrying with hint after empty post-tool reply roles=[${roleSummary}] tools=[${exposedTools.join(',') || '-'}]`
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
        message: `LLM orchestrator ${conversationId} round=${round} produced no visible assistant text afterToolRound=${afterToolRound} toolResults=[${toolSummary}] roles=[${roleSummary}] tools=[${exposedTools.join(',') || '-'}] requested=[${requestedToolCalls.join(',') || '-'}]`
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

module.exports = {publishOrchestratorPrompt, publishLlmRequest, publishToolCall, publishEmptyLlmReply, publishEmptyLlmRetry, publishHistoryProjection}
