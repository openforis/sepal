const {concat, concatMap, defer, filter, from, ignoreElements, map, of, tap} = require('rxjs')
const {turnContextMessage} = require('./turnContext')

const MAX_TOOL_ROUNDS = 8
const TOOL_ROUND_CAP_MESSAGE = 'This is taking more steps than expected, so I\'ve stopped here. Please try rephrasing your request.'

function createConversation({llm, history, tools, tracer, systemPrompt, initialMessages = [], id}) {
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
        const llmMessages = messagesForLlm({selection, includeTurnContext})
        const after$ = defer(() => {
            const llmRequestedTools = acc.toolCalls.length > 0
            return llmRequestedTools
                ? handleToolCalls$(acc.text, acc.toolCalls, {toolContext, round})
                : reply$(acc.text)
        })
        return concat(llmStream$(llmMessages, acc), after$)
    }

    function llmStream$(llmMessages, acc) {
        return tracer.span$('llm.respondTo', {messageCount: llmMessages.length},
            llm.respondTo$({messages: llmMessages, tools: tools.schemas()}).pipe(
                tap(event => {
                    if (event.textDelta) acc.text += event.textDelta
                    if (event.toolCall) acc.toolCalls = [...acc.toolCalls, event.toolCall]
                }),
                filter(event => event.textDelta != null)
            )
        )
    }

    function messagesForLlm({selection, includeTurnContext}) {
        if (!includeTurnContext) return messages
        const contextMessage = turnContextMessage(selection)
        if (!contextMessage) return messages
        const lastIndex = messages.length - 1
        return [...messages.slice(0, lastIndex), contextMessage, messages[lastIndex]]
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
            of({toolStart: ref}),
            tracer.span$('tool.invoke', {toolName: toolCall.name}, tools.invoke$(toolCall, toolContext)).pipe(
                tap(result => collected.results.push({...ref, result})),
                map(result => ({toolEnd: {...ref, ok: result.ok}}))
            )
        )
    }

    function toolRoundCapReached$() {
        return tracer.span$('conversation.toolRoundCapReached', {conversationId: id, maxRounds: MAX_TOOL_ROUNDS},
            concat(
                of({textDelta: TOOL_ROUND_CAP_MESSAGE}),
                append$({role: 'assistant', content: TOOL_ROUND_CAP_MESSAGE}).pipe(ignoreElements())
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
