const {concat, concatMap, defer, filter, from, ignoreElements, map, of, tap} = require('rxjs')
const {turnContextMessage} = require('./turnContext')
const {truncateTo, MAX_DEBUG_TEXT} = require('../llm/common/text')

const MAX_TOOL_ROUNDS = 8
const TOOL_ROUND_CAP_MESSAGE = 'This is taking more steps than expected, so I\'ve stopped here. Please try rephrasing your request.'
const NOOP_BUS = {publish() {}}

function createConversation({llm, history, tools, tracer, systemPrompt, initialMessages = [], id, bus = NOOP_BUS}) {
    const messages = [
        ...(systemPrompt ? [{role: 'system', content: systemPrompt}] : []),
        ...initialMessages
    ] // Mutable

    return {id, sendUserMessage$, messagesSnapshot}

    function messagesSnapshot() {
        return [...messages]
    }

    function sendUserMessage$(text, {selection, toolContext} = {}) {
        return tracer.span$('conversation.send', {conversationId: id},
            append$({role: 'user', content: text}).pipe(
                concatMap(() => step$({selection, includeTurnContext: true, toolContext, round: 0}))
            )
        )
    }

    function step$({selection, includeTurnContext, toolContext, round = 0} = {}) {
        const acc = {text: '', toolCalls: []}
        const llmMessages = messagesForLlm({selection, includeTurnContext, isolateHistory: round > 0})
        const toolSchemas = tools.schemas()
        publishLlmRequest({round, llmMessages, toolSchemas})
        const after$ = defer(() => {
            const llmRequestedTools = acc.toolCalls.length > 0
            return llmRequestedTools
                ? handleToolCalls$(acc.text, acc.toolCalls, {toolContext, round})
                : reply$(acc.text)
        })
        return concat(llmStream$(llmMessages, toolSchemas, acc, round), after$)
    }

    function llmStream$(llmMessages, toolSchemas, acc, round) {
        return tracer.span$('llm.respondTo', {messageCount: llmMessages.length},
            llm.respondTo$({messages: llmMessages, tools: toolSchemas}).pipe(
                tap(event => {
                    if (event.textDelta) acc.text += event.textDelta
                    if (event.toolCall) {
                        acc.toolCalls = [...acc.toolCalls, event.toolCall]
                        publishToolCall({round, toolCall: event.toolCall})
                    }
                }),
                filter(event => event.textDelta != null)
            )
        )
    }

    function messagesForLlm({selection, includeTurnContext, isolateHistory}) {
        const latestUserIndex = Math.max(messages.findLastIndex(message => message.role === 'user'), 0)
        const completed = messages.slice(0, latestUserIndex)
        // Post-tool rounds see only system messages + the active turn; replaying
        // finished turns lets a local model latch onto an unrelated completed task.
        const history = isolateHistory
            ? completed.filter(message => message.role === 'system')
            : projectCompletedTurns(completed)
        const activeTurn = messages.slice(latestUserIndex)
        const contextMessage = includeTurnContext ? turnContextMessage(selection) : null
        return contextMessage
            ? [...history, contextMessage, ...activeTurn]
            : [...history, ...activeTurn]
    }

    // Completed turns are replayed to the LLM as plain user/assistant dialogue:
    // their tool-call and tool-result messages are executable plumbing a local
    // model can mistake for still-active work. Persisted history keeps them.
    function projectCompletedTurns(completed) {
        const projected = completed.flatMap(message => {
            if (message.role === 'tool') return []
            if (message.role === 'assistant' && message.toolCalls) {
                return message.content?.trim() ? [{role: 'assistant', content: message.content}] : []
            }
            return [message]
        })
        publishHistoryProjection({before: completed, after: projected})
        return projected
    }

    function handleToolCalls$(text, toolCalls, {toolContext, round}) {
        const collected = {results: []}
        return concat(
            append$({role: 'assistant', content: text || '', toolCalls}).pipe(ignoreElements()),
            from(toolCalls).pipe(concatMap(toolCall => invokeTool$(toolCall, toolContext, collected))),
            defer(() => append$({role: 'tool', toolResults: collected.results}).pipe(ignoreElements())),
            defer(() => {
                const capReached = round + 1 >= MAX_TOOL_ROUNDS
                return capReached
                    ? toolRoundCapReached$()
                    : step$({toolContext, round: round + 1})
            })
        )
    }

    function invokeTool$(toolCall, toolContext, collected) {
        const ref = {toolCallId: toolCall.id, toolName: toolCall.name}
        return concat(
            of({toolStart: {...ref, input: toolCall.input}}),
            tracer.span$('tool.invoke', {toolName: toolCall.name}, tools.invoke$(toolCall, toolContext)).pipe(
                // collected.results is the persisted shape; the load path rebuilds from it.
                // toolStart/toolEnd carry input/data/error for live display only.
                tap(result => {
                    collected.results.push({...ref, result})
                }),
                map(result => ({toolEnd: {...ref, ok: result.ok, data: result.data, error: result.error}}))
            )
        )
    }

    function toolRoundCapReached$() {
        const display = {
            key: 'home.chat.notices.toolRoundCap',
            args: {max: MAX_TOOL_ROUNDS},
            fallback: TOOL_ROUND_CAP_MESSAGE
        }
        const message = {role: 'assistant', content: TOOL_ROUND_CAP_MESSAGE, display}
        return tracer.span$('conversation.toolRoundCapReached', {conversationId: id, maxRounds: MAX_TOOL_ROUNDS},
            concat(
                of({notice: {content: TOOL_ROUND_CAP_MESSAGE, display}}),
                append$(message).pipe(ignoreElements())
            )
        )
    }

    function reply$(text) {
        return append$({role: 'assistant', content: text}).pipe(
            ignoreElements()
        )
    }

    function append$(message) {
        return defer(() => {
            messages.push(message)
            return history.append$(message)
        })
    }

    function publishLlmRequest({round, llmMessages, toolSchemas}) {
        const offeredTools = toolSchemas.map(tool => tool.name)
        bus.publish({
            type: 'conversation.llmRequest',
            level: 'debug',
            conversationId: id,
            round,
            messageCount: llmMessages.length,
            offeredTools,
            message: `LLM turn ${id} round=${round} messages=${messageSummary(llmMessages)} tools=[${offeredTools.join(',')}]`
        })
        bus.publish({
            type: 'conversation.llmMessages',
            level: 'trace',
            conversationId: id,
            round,
            message: () => `LLM turn ${id} round=${round} messages payload: ${truncateJson(llmMessages)}`
        })
        bus.publish({
            type: 'conversation.llmTools',
            level: 'trace',
            conversationId: id,
            round,
            message: () => `LLM turn ${id} round=${round} tools payload: ${truncateJson(toolSchemas)}`
        })
    }

    function publishToolCall({round, toolCall}) {
        bus.publish({
            type: 'conversation.llmToolCall',
            level: 'debug',
            conversationId: id,
            round,
            toolName: toolCall.name,
            toolCallId: toolCall.id,
            message: `LLM turn ${id} round=${round} requested tool ${toolCall.name} (${toolCall.id})`
        })
        bus.publish({
            type: 'conversation.llmToolCallPayload',
            level: 'trace',
            conversationId: id,
            round,
            toolName: toolCall.name,
            toolCallId: toolCall.id,
            message: () => `LLM turn ${id} round=${round} tool call payload: ${truncateJson(toolCall)}`
        })
    }

    function publishHistoryProjection({before, after}) {
        if (before.length === 0) return
        bus.publish({
            type: 'conversation.historyProjection',
            level: 'debug',
            conversationId: id,
            beforeCount: before.length,
            afterCount: after.length,
            message: `LLM history projection ${id}: completed messages ${before.length} -> ${after.length}`
        })
        bus.publish({
            type: 'conversation.historyProjectionPayload',
            level: 'trace',
            conversationId: id,
            message: () => `LLM history projection ${id} before=${truncateJson(before)} after=${truncateJson(after)}`
        })
    }
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

module.exports = {createConversation, MAX_TOOL_ROUNDS}
