const {catchError, concat, concatMap, defer, filter, from, ignoreElements, map, of, tap, toArray} = require('rxjs')
const {turnContextMessage} = require('./turnContext')

function createConversation({llm, history, tools, tracer, systemPrompt, initialMessages = [], id}) {
    const messages = [
        ...(systemPrompt ? [{role: 'system', content: systemPrompt}] : []),
        ...initialMessages
    ] // Mutable

    return {id, sendUserMessage$, messagesSnapshot}

    function messagesSnapshot() {
        return [...messages]
    }

    function sendUserMessage$(text, {selection} = {}) {
        return tracer.span$('conversation.send', {conversationId: id},
            append$({role: 'user', content: text}).pipe(
                concatMap(() => step$({selection, includeTurnContext: true}))
            )
        )
    }

    function step$({selection, includeTurnContext} = {}) {
        const acc = {text: '', toolCalls: []}
        const llmMessages = messagesForLlm({selection, includeTurnContext})
        const stream$ = tracer.span$('llm.respondTo', {messageCount: llmMessages.length},
            llm.respondTo$({messages: llmMessages}).pipe(
                tap(event => {
                    if (event.textDelta) acc.text += event.textDelta
                    if (event.toolCall) acc.toolCalls = [...acc.toolCalls, event.toolCall]
                }),
                filter(event => event.textDelta != null)
            )
        )
        const after$ = defer(() =>
            acc.toolCalls.length > 0
                ? handleToolCalls$(acc.text, acc.toolCalls)
                : reply$(acc.text)
        )
        return concat(stream$, after$)
    }

    function messagesForLlm({selection, includeTurnContext}) {
        if (!includeTurnContext) return messages
        const contextMessage = turnContextMessage(selection)
        if (!contextMessage) return messages
        const lastIndex = messages.length - 1
        return [...messages.slice(0, lastIndex), contextMessage, messages[lastIndex]]
    }

    function handleToolCalls$(text, toolCalls) {
        return append$({role: 'assistant', content: text || '', toolCalls}).pipe(
            concatMap(() => invokeTools$(toolCalls)),
            concatMap(toolResults => append$({role: 'tool', toolResults})),
            concatMap(() => step$())
        )
    }

    function reply$(text) {
        return append$({role: 'assistant', content: text}).pipe(
            ignoreElements()
        )
    }

    function invokeTools$(toolCalls) {
        return from(toolCalls).pipe(
            concatMap(toolCall => tools.invoke$(toolCall).pipe(
                catchError(error => of({error: error.message})),
                map(result => ({toolCallId: toolCall.id, toolName: toolCall.name, result}))
            )),
            toArray()
        )
    }

    function append$(message) {
        return defer(() => {
            messages.push(message)
            return history.append$(message)
        })
    }
}

module.exports = {createConversation}
