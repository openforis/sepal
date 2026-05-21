// Inner-loop runtime for a single specialist consultation. Runs an
// isolated agent loop with the specialist's prompt and scoped tool set,
// advancing the dialogue through LLM rounds and tool calls until a stop
// policy ends it. Passes channel emissions from inner tools through to the
// outer turn's wsChannel.
//
// One round = one LLM call. Each round is classified into a closed outcome:
//   answered       — visible text, no tool calls
//   tool-requested — tool calls present, possibly text too
//   silent         — neither
// The stop policy reads the outcome plus the tool timeline and returns a
// directive — continue (with optional append text) or stop (with a reason).
// The loop, not the policy, owns dialogue well-formedness: a continue after
// `silent` uses the append as a transient prompt-only nudge (no assistant
// turn to anchor a persisted user message); a continue after `answered`
// persists the assistant text then the corrective user nudge; tool calls
// persist as an assistant tool-call turn plus tool-result turns. The internal
// result is {finalText, finishReason, timeline}; the public observable maps
// that to {answer} for callers and lets channel emissions pass through.
//
// Publishes specialist.request / specialist.response per round and
// specialist.tool.request / specialist.tool.response per inner tool call
// for diagnostic observability. Does NOT emit {toolStart}/{toolEnd}
// plain objects — inner tools stay below the user-facing tool boundary.

const {EMPTY, concat, concatMap, defer, from, ignoreElements, map, mergeMap, of, tap} = require('rxjs')
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

function runSpecialist$({llm, bus, name, systemPrompt, userText, allowedSchemas, invokeTool$, context, noProgressNudge, finishOnEmpty}) {
    const guard = createToolCallGuard({consecutiveFailureBail, invalidArgsBail})
    const conversationId = context?.conversationId
    // Canonical record of round outcomes and tool results, enough to project the
    // {name, ok} tool history the caller-supplied stop predicates read. A one-shot
    // flag keeps the no-progress nudge firing at most once.
    const timeline = createTimeline()
    let noProgressNudged = false
    const initial = [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: userText}
    ]
    return bus.track$('specialist.run', {name}, runRound$(initial, {round: 0, stalls: 0, transientAppend: null})).pipe(
        map(value => isChannelEmission(value) ? value : {answer: value.finalText})
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
                const outcome = classifyRound(acc)
                timeline.recordOutcome(outcome)
                publishResponse(outcome, round)
                if (outcome.type === 'tool-requested') {
                    return runTools$(messages, outcome, round, stalls)
                }
                const directive = decideNext(outcome, round, stalls)
                if (directive.type === 'stop') return of(stopResult(directive.reason, directive.finalText))
                return continueAfter$(outcome, directive.append, messages, promptMessages, round, stalls)
            })
        )
    }

    // Stop policy for a non-tool round. Reads the outcome and the tool timeline;
    // returns only continue (with append text) or stop (with a reason). The loop
    // turns the append into either a transient or persisted nudge per outcome.
    function decideNext(outcome, round, stalls) {
        if (outcome.type === 'silent') {
            // The caller may finish the loop on an empty response instead of
            // nudging — e.g. once the work is already done and a narrower
            // post-processing step should own the final answer.
            if (finishOnEmpty?.(timeline.toolHistory())) return stop('finish-on-empty', outcome.text)
            if (stalls >= SPECIALIST_MAX_STALLS) return stop('capped', SPECIALIST_CAP_ANSWER)
            return {type: 'continue', append: STALL_NUDGE.content}
        }
        const nudge = noProgressNudgeFor(round)
        if (nudge) return {type: 'continue', append: nudge}
        return stop('answered', outcome.text)
    }

    // Applies a continue directive, owning dialogue well-formedness. A silent
    // round has no assistant turn to anchor a persisted user message, so its
    // append rides along as a transient prompt-only nudge and charges the stall
    // budget; an answered round persists the assistant prose plus the corrective
    // nudge and charges a productive round.
    function continueAfter$(outcome, append, messages, promptMessages, round, stalls) {
        if (outcome.type === 'silent') {
            publishSpecialistStall({
                bus, name, round, conversationId,
                stallCount: stalls + 1,
                messageCount: promptMessages.length,
                toolNames: allowedSchemas.map(schema => schema.name)
            })
            return runRound$(messages, {round, stalls: stalls + 1, transientAppend: append})
        }
        noProgressNudged = true
        publishSpecialistNoProgress({
            bus, name, round, conversationId,
            messageCount: promptMessages.length,
            toolNames: allowedSchemas.map(schema => schema.name),
            nudgeChars: append.length,
            reason: NO_PROGRESS_REASON
        })
        return runRound$(
            [...messages, {role: 'assistant', content: outcome.text}, {role: 'user', content: append}],
            {round: round + 1, stalls, transientAppend: null}
        )
    }

    function runTools$(messages, outcome, round, stalls) {
        const assistantMessage = {role: 'assistant', content: outcome.text || '', toolCalls: outcome.calls}
        const toolResults = []
        return concat(
            from(outcome.calls).pipe(
                concatMap(toolCall => callTool$(toolCall).pipe(
                    mergeMap(value => {
                        if (isChannelEmission(value)) return of(value)
                        toolResults.push({toolCallId: toolCall.id, toolName: toolCall.name, result: value})
                        timeline.recordToolResult({name: toolCall.name, ok: value?.ok === true})
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

    // A non-empty final response with no tool call gets one corrective nudge if
    // the caller's predicate says progress is incomplete (e.g. update prepared
    // an edit but never patched). Bounded: one nudge, and never on the last round.
    function noProgressNudgeFor(round) {
        if (noProgressNudged || !noProgressNudge) return null
        if (round + 1 >= SPECIALIST_MAX_ROUNDS) return null
        return noProgressNudge(timeline.toolHistory()) || null
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

function stop(reason, finalText) {
    return {type: 'stop', reason, finalText}
}

function classifyRound({text, toolCalls, responseMeta}) {
    if (toolCalls.length) return {type: 'tool-requested', text, calls: toolCalls, meta: responseMeta}
    if (text.trim()) return {type: 'answered', text, meta: responseMeta}
    return {type: 'silent', text, meta: responseMeta}
}

function createTimeline() {
    const entries = []
    return {
        recordOutcome(outcome) { entries.push({kind: 'round', type: outcome.type}) },
        recordToolResult({name, ok}) { entries.push({kind: 'tool', name, ok}) },
        // Projection the caller-supplied stop predicates read: the {name, ok} of
        // every tool result so far, in call order.
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

module.exports = {runSpecialist$, SPECIALIST_MAX_ROUNDS, SPECIALIST_CAP_ANSWER}
