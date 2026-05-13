const {catchError, concat, concatMap, defer, filter, from, ignoreElements, map, of, tap, toArray} = require('rxjs')

function createConversation({llm, history, tools, tracer, systemPrompt, initialMessages = [], id}) {
    const messages = [
        ...(systemPrompt ? [{role: 'system', content: systemPrompt}] : []),
        ...initialMessages
    ] // Mutable

    return {id, sendUserMessage$, messagesSnapshot}

    function messagesSnapshot() {
        return [...messages]
    }

    function sendUserMessage$(text) {
        return tracer.span$('conversation.send', {conversationId: id},
            append$({role: 'user', content: text}).pipe(
                concatMap(() => step$())
            )
        )
    }

    function step$() {
        const acc = {text: '', toolCalls: []}
        const stream$ = tracer.span$('llm.respondTo', {messageCount: messages.length},
            llm.respondTo$({messages}).pipe(
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
