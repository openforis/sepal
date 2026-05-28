const {EMPTY, concat, concatMap, defer, from, ignoreElements, map, mergeMap, of, tap} = require('rxjs')
const {createToolCallGuard} = require('../toolCallGuard')
const {isChannelEmission} = require('../channelEvents')
const {
    publishSpecialistPrompt,
    publishSpecialistRequest,
    publishSpecialistResponse,
    publishSpecialistStall,
    publishSpecialistToolRequest,
    publishSpecialistToolResponse
} = require('./specialistRuntimeEvents')

const SPECIALIST_MAX_ROUNDS = 5
const SPECIALIST_MAX_STALLS = 2
const SPECIALIST_CAP_ANSWER = 'Specialist step cap exceeded; partial information only.'
const STALL_NUDGE_CONTENT = 'Continue working on the original request. Either make the next tool call needed, or send a final summary if the request is fulfilled.'

function createSpecialistRuntime({llm, bus, name, systemPrompt, tools, finishOnEmpty, usageRole = 'specialist'}) {
    const canonicalizeCall = tools.canonicalizeCall || identity
    const allowedSchemas = tools.schemas
    const invokeTool$ = tools.invoke$

    return {consult$}

    function consult$({userText, context}) {
        const guard = createToolCallGuard({consecutiveFailureBail, invalidArgsBail})
        const conversationId = context?.conversationId
        const timeline = createTimeline()
        const initial = [
            {role: 'system', content: systemPrompt},
            {role: 'user', content: userText}
        ]
        return bus.track$('specialist.run', {name}, runRound$(initial, {round: 0, stalls: 0, transientAppend: null})).pipe(
            map(value => isChannelEmission(value) ? value : asSpecialistResult(value))
        )

        function runRound$(messages, {round, stalls, transientAppend}) {
            const acc = {text: '', toolCalls: []}
            const promptMessages = transientAppend
                ? [...messages, {role: 'user', content: transientAppend}]
                : messages
            publishSpecialistRequest({bus, name, round, conversationId, messages: promptMessages, toolSchemas: allowedSchemas})
            publishSpecialistPrompt({bus, name, round, conversationId, messages: promptMessages, toolSchemas: allowedSchemas})
            return concat(
                llm.respondTo$({
                    messages: promptMessages,
                    tools: allowedSchemas,
                    debugLabel: `specialist ${name} round ${round}`,
                    usageContext: {role: usageRole, specialist: name, conversationId}
                }).pipe(
                    tap(event => {
                        if (event.textDelta) acc.text += event.textDelta
                        if (event.toolCall) acc.toolCalls = [...acc.toolCalls, event.toolCall]
                        if (event.responseMeta) acc.responseMeta = event.responseMeta
                    }),
                    ignoreElements()
                ),
                defer(() => {
                    const outcome = classifyRound(acc)
                    timeline.recordOutcome(outcome)
                    publishResponse(outcome, round)
                    if (outcome.type === 'tool-requested') return runTools$(messages, outcome, round, stalls)
                    const directive = decideNext(outcome, stalls)
                    if (directive.type === 'stop') return of(stopResult(directive.reason, directive.finalText))
                    return continueAfterStall$({messages, outcome, round, stalls, messageCount: promptMessages.length})
                })
            )
        }

        function decideNext(outcome, stalls) {
            if (outcome.type === 'answered') return stop('answered', outcome.text)
            if (finishOnEmpty?.(timeline.toolHistory())) return stop('finish-on-empty', outcome.text)
            if (stalls >= SPECIALIST_MAX_STALLS) return stop('capped', SPECIALIST_CAP_ANSWER)
            return {type: 'continue'}
        }

        function continueAfterStall$({messages, outcome, round, stalls, messageCount}) {
            publishSpecialistStall({
                bus, name, round, conversationId,
                stallCount: stalls + 1,
                messageCount,
                toolNames: allowedSchemas.map(schema => schema.name)
            })
            return runRound$(carrySilentReasoning(messages, outcome), {round, stalls: stalls + 1, transientAppend: STALL_NUDGE_CONTENT})
        }

        function runTools$(messages, outcome, round, stalls) {
            const canonicalCalls = outcome.calls.map(call => canonicalizeCall(call, context))
            const assistantMessage = {
                role: 'assistant',
                content: outcome.text || '',
                toolCalls: canonicalCalls,
                ...(outcome.meta?.reasoning ? {reasoning: outcome.meta.reasoning} : {})
            }
            const toolResults = []
            return concat(
                from(canonicalCalls).pipe(
                    concatMap(toolCall => callTool$(toolCall).pipe(
                        mergeMap(value => {
                            if (isChannelEmission(value)) return of(value)
                            toolResults.push({toolCallId: toolCall.id, toolName: toolCall.name, result: value})
                            timeline.recordToolResult({name: toolCall.name, ok: value?.ok === true, result: value, input: toolCall.input})
                            return EMPTY
                        })
                    ))
                ),
                defer(() => {
                    const bailAnswer = guard.bail()
                    if (bailAnswer) return of(stopResult('guard-bailed', bailAnswer))
                    if (round + 1 >= SPECIALIST_MAX_ROUNDS) {
                        return of(stopResult('capped', outcome.text.trim() ? outcome.text : SPECIALIST_CAP_ANSWER))
                    }
                    return runRound$(
                        [...messages, assistantMessage, {role: 'tool', toolResults}],
                        {round: round + 1, stalls, transientAppend: null}
                    )
                })
            )
        }

        function callTool$(canonical) {
            const blocked = guard.blockedRepeat(canonical)
            if (blocked) {
                publishSpecialistToolRequest({bus, name, conversationId, toolCall: canonical})
                publishSpecialistToolResponse({bus, name, conversationId, tool: canonical.name, envelope: blocked})
                return of(blocked)
            }
            publishSpecialistToolRequest({bus, name, conversationId, toolCall: canonical})
            return bus.track$('specialist.tool.invoke', toolSpanAttrs({conversationId, specialist: name, tool: canonical.name}), invokeTool$(canonical, context)).pipe(
                tap(value => {
                    if (isChannelEmission(value)) return
                    publishSpecialistToolResponse({bus, name, conversationId, tool: canonical.name, envelope: value})
                    guard.record(canonical, value)
                })
            )
        }

        function publishResponse(outcome, round) {
            publishSpecialistResponse({
                bus, name, round, conversationId,
                text: outcome.text,
                toolCalls: outcome.calls || [],
                reasoningChars: outcome.meta?.reasoningChars ?? 0,
                finishReason: outcome.meta?.finishReason ?? null
            })
        }

        function stopResult(finishReason, finalText) {
            return {finalText, finishReason, timeline: timeline.entries()}
        }
    }
}

function answerOnly() {
    return map(value => isChannelEmission(value) ? value : {answer: value.answer})
}

function wasCapped(result) {
    return result?.finishReason === 'capped'
}

function asSpecialistResult({finalText, finishReason, timeline}) {
    return {answer: finalText, finishReason, timeline}
}

function identity(value) {
    return value
}

function toolSpanAttrs({conversationId, specialist, tool}) {
    return {
        ...(conversationId ? {conversationId} : {}),
        specialist,
        tool
    }
}

function stop(reason, finalText) {
    return {type: 'stop', reason, finalText}
}

function classifyRound({text, toolCalls, responseMeta}) {
    if (toolCalls.length) return {type: 'tool-requested', text, calls: toolCalls, meta: responseMeta}
    if (text.trim()) return {type: 'answered', text, meta: responseMeta}
    return {type: 'silent', text, meta: responseMeta}
}

function carrySilentReasoning(messages, outcome) {
    const reasoning = outcome.meta?.reasoning
    if (!reasoning) return messages
    return [...messages, {role: 'assistant', content: outcome.text || '', reasoning}]
}

function createTimeline() {
    const entries = []
    return {
        recordOutcome(outcome) { entries.push({kind: 'round', type: outcome.type}) },
        recordToolResult({name, ok, result, input}) { entries.push({kind: 'tool', name, ok, result, input}) },
        toolHistory() { return entries.filter(entry => entry.kind === 'tool').map(({name, ok}) => ({name, ok})) },
        entries() { return [...entries] }
    }
}

function consecutiveFailureBail(tool) {
    return `Specialist halted: repeated failures on ${tool}.`
}

function invalidArgsBail(tool) {
    return `Specialist halted: invalid args on ${tool}.`
}

module.exports = {createSpecialistRuntime, answerOnly, wasCapped, SPECIALIST_MAX_ROUNDS, SPECIALIST_CAP_ANSWER}
