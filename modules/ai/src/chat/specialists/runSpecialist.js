// Inner-loop runtime for a single specialist consultation. Runs an
// isolated LLM loop with the specialist's prompt and scoped tool set;
// passes channel emissions from inner tools through to the outer
// turn's wsChannel.
//
// Publishes specialist.request / specialist.response per round and
// specialist.tool.request / specialist.tool.response per inner tool call
// for diagnostic observability. Does NOT emit {toolStart}/{toolEnd}
// plain objects — inner tools stay below the user-facing tool boundary.

const {EMPTY, concat, concatMap, defer, from, ignoreElements, mergeMap, of, tap} = require('rxjs')
const {createToolCallGuard} = require('../toolCallGuard')
const {isChannelEmission} = require('../channelEvents')
const {
    publishSpecialistPrompt,
    publishSpecialistRequest,
    publishSpecialistResponse,
    publishSpecialistStall,
    publishSpecialistNoProgress,
    publishSpecialistToolRequest,
    publishSpecialistToolResponse
} = require('./specialistEvents')

const NO_PROGRESS_REASON = 'no-progress-nudge'

// Productive rounds are those that emit a tool call or a final answer. The
// budget bounds real work; empty-response stalls get their own small allowance
// so a transient hiccup mid-flow can't starve the productive budget. The hard
// cap on total inner LLM calls is the sum, so an only-ever-empty model still
// terminates with the cap answer.
const SPECIALIST_MAX_ROUNDS = 5
const SPECIALIST_MAX_STALLS = 2
const SPECIALIST_CAP_ANSWER = 'Specialist step cap exceeded; partial information only.'
// Transient user-role nudge appended once after an empty inner response.
// Matches the archived conversationLoop's STALL_NUDGE wording; never persisted
// into the loop's messages array so it can't leak into post-tool rounds.
const STALL_NUDGE = {
    role: 'user',
    content: 'Continue working on the original request. Either make the next tool call needed, or send a final summary if the request is fulfilled.'
}

function runSpecialist$({llm, bus, name, systemPrompt, userText, allowedSchemas, invokeTool$, context, noProgressNudge}) {
    const guard = createToolCallGuard({consecutiveFailureBail, invalidArgsBail})
    const conversationId = context?.conversationId
    // Tool calls observed across the loop (name + ok), and a one-shot flag so a
    // caller-supplied no-progress nudge fires at most once.
    const toolHistory = []
    let noProgressNudged = false
    const initial = [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: userText}
    ]
    return bus.track$('specialist.run', {name}, step$(initial, 0, 0, false))

    function step$(messages, round, stalls, stalling) {
        const acc = {text: '', toolCalls: []}
        const promptMessages = stalling ? [...messages, STALL_NUDGE] : messages
        publishSpecialistRequest({bus, name, round, conversationId, messages: promptMessages, toolSchemas: allowedSchemas})
        publishSpecialistPrompt({bus, name, round, conversationId, messages: promptMessages, toolSchemas: allowedSchemas})
        return concat(
            llm.respondTo$({
                messages: promptMessages,
                tools: allowedSchemas,
                debugLabel: `specialist ${name} round ${round}`,
                usageContext: {role: 'specialist', specialist: name, conversationId}
            }).pipe(
                tap(event => {
                    if (event.textDelta) acc.text += event.textDelta
                    if (event.toolCall) acc.toolCalls = [...acc.toolCalls, event.toolCall]
                    if (event.responseMeta) acc.responseMeta = event.responseMeta
                }),
                ignoreElements()
            ),
            defer(() => {
                publishSpecialistResponse({
                    bus, name, round, conversationId, text: acc.text, toolCalls: acc.toolCalls,
                    reasoningChars: acc.responseMeta?.reasoningChars ?? 0,
                    finishReason: acc.responseMeta?.finishReason ?? null
                })
                const empty = !acc.text.trim() && acc.toolCalls.length === 0
                if (empty) {
                    if (stalls >= SPECIALIST_MAX_STALLS) return of({answer: SPECIALIST_CAP_ANSWER})
                    publishSpecialistStall({
                        bus, name, round, conversationId,
                        stallCount: stalls + 1,
                        messageCount: promptMessages.length,
                        toolNames: allowedSchemas.map(schema => schema.name)
                    })
                    return step$(messages, round, stalls + 1, true)
                }
                if (acc.toolCalls.length === 0) {
                    const nudge = noProgressNudgeFor(round)
                    if (nudge) {
                        noProgressNudged = true
                        publishSpecialistNoProgress({
                            bus, name, round, conversationId,
                            messageCount: promptMessages.length,
                            toolNames: allowedSchemas.map(schema => schema.name),
                            nudgeChars: nudge.length,
                            reason: NO_PROGRESS_REASON
                        })
                        return step$(
                            [...messages, {role: 'assistant', content: acc.text}, {role: 'user', content: nudge}],
                            round + 1,
                            stalls,
                            false
                        )
                    }
                    return of({answer: acc.text})
                }
                return runToolsAndContinue$(messages, acc, round, stalls)
            })
        )
    }

    function runToolsAndContinue$(messages, acc, round, stalls) {
        const assistantMessage = {role: 'assistant', content: acc.text || '', toolCalls: acc.toolCalls}
        const toolResults = []
        return concat(
            from(acc.toolCalls).pipe(
                concatMap(toolCall => callTool$(toolCall).pipe(
                    mergeMap(value => {
                        if (isChannelEmission(value)) return of(value)
                        toolResults.push({toolCallId: toolCall.id, toolName: toolCall.name, result: value})
                        toolHistory.push({name: toolCall.name, ok: value?.ok === true})
                        return EMPTY
                    })
                ))
            ),
            defer(() => {
                const bailAnswer = guard.bail()
                if (bailAnswer) return of({answer: bailAnswer})
                if (round + 1 >= SPECIALIST_MAX_ROUNDS) {
                    return of({answer: acc.text.trim() ? acc.text : SPECIALIST_CAP_ANSWER})
                }
                return step$(
                    [...messages, assistantMessage, {role: 'tool', toolResults}],
                    round + 1,
                    stalls,
                    false
                )
            })
        )
    }

    // A non-empty final response with no tool call gets one corrective nudge if
    // the caller's predicate says progress is incomplete (e.g. update prepared
    // an edit but never patched). Bounded: one nudge, and never on the last round.
    function noProgressNudgeFor(round) {
        if (noProgressNudged || !noProgressNudge) return null
        if (round + 1 >= SPECIALIST_MAX_ROUNDS) return null
        return noProgressNudge(toolHistory) || null
    }

    function callTool$(toolCall) {
        const blocked = guard.blockedRepeat(toolCall)
        if (blocked) {
            publishSpecialistToolRequest({bus, name, conversationId, toolCall})
            publishSpecialistToolResponse({bus, name, conversationId, tool: toolCall.name, envelope: blocked})
            return of(blocked)
        }
        publishSpecialistToolRequest({bus, name, conversationId, toolCall})
        return invokeTool$(toolCall, context).pipe(
            tap(value => {
                if (isChannelEmission(value)) return
                publishSpecialistToolResponse({bus, name, conversationId, tool: toolCall.name, envelope: value})
                guard.record(toolCall, value)
            })
        )
    }
}

function consecutiveFailureBail(tool) {
    return `Specialist halted: repeated failures on ${tool}.`
}

function invalidArgsBail(tool) {
    return `Specialist halted: invalid args on ${tool}.`
}

module.exports = {runSpecialist$, SPECIALIST_MAX_ROUNDS, SPECIALIST_CAP_ANSWER}
