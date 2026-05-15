const {concat, concatMap, defer, from, ignoreElements, map, of, tap, toArray} = require('rxjs')

const SPECIALIST_MAX_ROUNDS = 4
const SPECIALIST_CAP_ANSWER = 'Specialist step cap exceeded; partial information only.'

function runSpecialist$({llm, tracer, name, systemPrompt, userText, allowedSchemas, invokeTool$, context}) {
    const initial = [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: userText}
    ]
    return tracer.span$('specialist.run', {name}, step$(initial, 0))

    function step$(messages, round) {
        const acc = {text: '', toolCalls: []}
        return concat(
            llm.respondTo$({messages, tools: allowedSchemas}).pipe(
                tap(event => {
                    if (event.textDelta) acc.text += event.textDelta
                    if (event.toolCall) acc.toolCalls = [...acc.toolCalls, event.toolCall]
                }),
                ignoreElements()
            ),
            defer(() => {
                if (acc.toolCalls.length === 0) return of({answer: acc.text})
                if (round + 1 >= SPECIALIST_MAX_ROUNDS) return of({answer: acc.text.trim() ? acc.text : SPECIALIST_CAP_ANSWER})
                return runToolsAndContinue$(messages, acc, round)
            })
        )
    }

    function runToolsAndContinue$(messages, acc, round) {
        const assistantMessage = {role: 'assistant', content: acc.text || '', toolCalls: acc.toolCalls}
        return from(acc.toolCalls).pipe(
            concatMap(toolCall => invokeTool$(toolCall, context).pipe(
                map(result => ({toolCallId: toolCall.id, toolName: toolCall.name, result}))
            )),
            toArray(),
            concatMap(toolResults => step$(
                [...messages, assistantMessage, {role: 'tool', toolResults}],
                round + 1
            ))
        )
    }
}

module.exports = {runSpecialist$, SPECIALIST_MAX_ROUNDS}
