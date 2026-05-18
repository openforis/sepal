// Inner-loop runtime for a single specialist consultation. Runs an
// isolated LLM loop with the specialist's system prompt and scoped tool
// set, capped by SPECIALIST_MAX_ROUNDS and guarded by toolCallGuard —
// same anti-loop failure modes as the main turn.
//
// Inner tools may emit channel events (e.g. gui-action from
// guiProductRequest$); those flow up the returned observable so the
// outer turn's wsChannel can dispatch them. Only the non-channel-event
// emission is the tool result the guard records and the inner LLM sees.

const {EMPTY, concat, concatMap, defer, from, ignoreElements, mergeMap, of, tap} = require('rxjs')
const {createToolCallGuard} = require('../toolCallGuard')
const {isChannelEmission} = require('../channelEvents')

const SPECIALIST_MAX_ROUNDS = 4
const SPECIALIST_CAP_ANSWER = 'Specialist step cap exceeded; partial information only.'

function runSpecialist$({llm, tracer, name, systemPrompt, userText, allowedSchemas, invokeTool$, context}) {
    const guard = createToolCallGuard({consecutiveFailureBail, invalidArgsBail})
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
        const toolResults = []
        return concat(
            from(acc.toolCalls).pipe(
                concatMap(toolCall => callTool$(toolCall).pipe(
                    mergeMap(value => {
                        if (isChannelEmission(value)) return of(value)
                        toolResults.push({toolCallId: toolCall.id, toolName: toolCall.name, result: value})
                        return EMPTY
                    })
                ))
            ),
            defer(() => {
                const bailAnswer = guard.bail()
                if (bailAnswer) return of({answer: bailAnswer})
                return step$(
                    [...messages, assistantMessage, {role: 'tool', toolResults}],
                    round + 1
                )
            })
        )
    }

    function callTool$(toolCall) {
        const blocked = guard.blockedRepeat(toolCall)
        if (blocked) return of(blocked)
        return invokeTool$(toolCall, context).pipe(
            tap(value => { if (!isChannelEmission(value)) guard.record(toolCall, value) })
        )
    }
}

function consecutiveFailureBail(tool) {
    return `Specialist halted: repeated failures on ${tool}.`
}

function invalidArgsBail(tool) {
    return `Specialist halted: invalid args on ${tool}.`
}

module.exports = {runSpecialist$, SPECIALIST_MAX_ROUNDS}
