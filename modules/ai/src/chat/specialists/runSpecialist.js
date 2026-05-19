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
    publishSpecialistToolRequest,
    publishSpecialistToolResponse
} = require('./specialistEvents')

const SPECIALIST_MAX_ROUNDS = 5
const SPECIALIST_CAP_ANSWER = 'Specialist step cap exceeded; partial information only.'

function runSpecialist$({llm, bus, name, systemPrompt, userText, allowedSchemas, invokeTool$, context}) {
    const guard = createToolCallGuard({consecutiveFailureBail, invalidArgsBail})
    const conversationId = context?.conversationId
    const initial = [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: userText}
    ]
    return bus.track$('specialist.run', {name}, step$(initial, 0))

    function step$(messages, round) {
        const acc = {text: '', toolCalls: []}
        publishSpecialistRequest({bus, name, round, conversationId, messages, toolSchemas: allowedSchemas})
        publishSpecialistPrompt({bus, name, round, conversationId, messages, toolSchemas: allowedSchemas})
        return concat(
            llm.respondTo$({
                messages,
                tools: allowedSchemas,
                debugLabel: `specialist ${name} round ${round}`
            }).pipe(
                tap(event => {
                    if (event.textDelta) acc.text += event.textDelta
                    if (event.toolCall) acc.toolCalls = [...acc.toolCalls, event.toolCall]
                }),
                ignoreElements()
            ),
            defer(() => {
                publishSpecialistResponse({bus, name, round, conversationId, text: acc.text, toolCalls: acc.toolCalls})
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

module.exports = {runSpecialist$, SPECIALIST_MAX_ROUNDS}
