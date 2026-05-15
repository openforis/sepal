const {concat, concatMap, defer, filter, from, ignoreElements, map, of, tap} = require('rxjs')
const {messagesForLlm} = require('./llmMessages')
const {publishHistoryProjection, publishLlmRequest, publishToolCall} = require('./conversationEvents')

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

    function step$({selection, includeTurnContext, toolContext, round}) {
        const acc = {text: '', toolCalls: []}
        const {llmMessages, projection} = messagesForLlm({
            messages, selection, includeTurnContext, isolateHistory: round > 0
        })
        const toolSchemas = tools.schemas()
        publishHistoryProjection({bus, conversationId: id, projection})
        publishLlmRequest({bus, conversationId: id, round, llmMessages, toolSchemas})
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
                        publishToolCall({bus, conversationId: id, round, toolCall: event.toolCall})
                    }
                }),
                filter(event => event.textDelta != null)
            )
        )
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

}

module.exports = {createConversation, MAX_TOOL_ROUNDS}
