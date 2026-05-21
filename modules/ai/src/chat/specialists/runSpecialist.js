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
    publishSpecialistToolRequest,
    publishSpecialistToolResponse
} = require('./specialistEvents')

const SPECIALIST_MAX_ROUNDS = 5
const SPECIALIST_CAP_ANSWER = 'Specialist step cap exceeded; partial information only.'
// Transient user-role nudge appended once after an empty inner response.
// Matches the archived conversationLoop's STALL_NUDGE wording; never persisted
// into the loop's messages array so it can't leak into post-tool rounds.
const STALL_NUDGE = {
    role: 'user',
    content: 'Continue working on the original request. Either make the next tool call needed, or send a final summary if the request is fulfilled.'
}

function runSpecialist$({llm, bus, name, systemPrompt, userText, allowedSchemas, invokeTool$, context}) {
    const guard = createToolCallGuard({consecutiveFailureBail, invalidArgsBail})
    const conversationId = context?.conversationId
    const initial = [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: userText}
    ]
    return bus.track$('specialist.run', {name}, step$(initial, 0, 0))

    function step$(messages, round, stallCount) {
        const acc = {text: '', toolCalls: []}
        const promptMessages = stallCount > 0 ? [...messages, STALL_NUDGE] : messages
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
                }),
                ignoreElements()
            ),
            defer(() => {
                publishSpecialistResponse({bus, name, round, conversationId, text: acc.text, toolCalls: acc.toolCalls})
                const empty = !acc.text.trim() && acc.toolCalls.length === 0
                const canRetry = stallCount === 0 && round + 1 < SPECIALIST_MAX_ROUNDS
                if (empty && canRetry) {
                    publishSpecialistStall({
                        bus, name, round, conversationId,
                        stallCount: stallCount + 1,
                        messageCount: promptMessages.length,
                        toolNames: allowedSchemas.map(schema => schema.name)
                    })
                    return step$(messages, round + 1, stallCount + 1)
                }
                if (acc.toolCalls.length === 0) return of({answer: acc.text})
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
                if (round + 1 >= SPECIALIST_MAX_ROUNDS) {
                    return of({answer: acc.text.trim() ? acc.text : SPECIALIST_CAP_ANSWER})
                }
                return step$(
                    [...messages, assistantMessage, {role: 'tool', toolResults}],
                    round + 1,
                    0
                )
            })
        )
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
