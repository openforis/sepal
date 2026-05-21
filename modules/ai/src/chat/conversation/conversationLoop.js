// Per-conversation LLM/tool loop. Owns the mutable messages array,
// runs each turn against the LLM and tools, and persists each
// appended message through history.
//
// Each round classifies the LLM response into a RoundOutcome (answered /
// tool-requested / silent), then a stop policy decides continue vs stop:
// decideAfterStream$ after a no-tool round, decideAfterTools$ after a tool
// round. This round/outcome/stop-policy shape is shared with runSpecialist$,
// but the two loops do not share code — and diverge on nearly every concrete
// axis: this loop streams channel events ({textDelta}/{toolStart}/{toolEnd})
// and persists every message through the history port; the specialist loop
// threads an immutable message list, keeps a tool timeline, and returns a
// collected result. Continuation here also persists differently per outcome:
// a tool round persists assistant + tool-result turns; the post-tool empty
// retry rides a transient system hint (not persisted) and fires at most once.

const {concat, concatMap, defer, filter, from, ignoreElements, mergeMap, of, tap} = require('rxjs')
const {messagesForLlm} = require('./llmMessages')
const {publishEmptyLlmReply, publishEmptyLlmRetry, publishHistoryProjection, publishLlmRequest, publishOrchestratorPrompt, publishToolCall} = require('./conversationEvents')
const {createTerminalNotices, consecutiveFailureBail, invalidArgsBail} = require('./terminalNotices')
const {createToolCallGuard} = require('../toolCallGuard')
const {createDiagnostics} = require('../diagnostics')
const {isChannelEmission} = require('../channelEvents')
const {turnContextMessage} = require('../turnContext')
const {emptyAfterToolHint} = require('../llmText/prompts')

const EMPTY_AFTER_TOOL_HINT = emptyAfterToolHint()
const DEFAULT_DIAGNOSTICS = createDiagnostics()

const MAX_TOOL_ROUNDS = 8

function createConversationLoop({id, initialMessages = [], llm, history, tools, bus, diagnostics = DEFAULT_DIAGNOSTICS}) {
    const messages = [...initialMessages]
    const notices = createTerminalNotices({bus, conversationId: id, append$})

    return {runTurn$, messagesSnapshot}

    function messagesSnapshot() {
        return [...messages]
    }

    function runTurn$(text, {guiContext, toolContext} = {}) {
        const turn = {
            toolContext,
            guard: createToolCallGuard({consecutiveFailureBail, invalidArgsBail}),
            contextMessage: turnContextMessage(guiContext)
        }
        return bus.track$('conversation.send', {conversationId: id},
            append$({role: 'user', content: text}).pipe(
                concatMap(() => step$(turn, {round: 0}))
            )
        )
    }

    function step$(turn, {round, retried, retryHint}) {
        const acc = {text: '', toolCalls: []}
        const {llmMessages: baseMessages, projection} = messagesForLlm({
            messages,
            contextMessage: turn.contextMessage,
            isolateHistory: round > 0
        })
        const llmMessages = messagesWithHint(baseMessages, retryHint)
        const toolSchemas = tools.schemas()
        turn.lastExposedTools = toolSchemas.map(schema => schema.name)
        publishHistoryProjection({bus, diagnostics, conversationId: id, projection})
        publishLlmRequest({bus, diagnostics, conversationId: id, round, llmMessages, toolSchemas})
        publishOrchestratorPrompt({bus, conversationId: id, round, llmMessages, toolSchemas})
        return concat(
            llmStream$(llmMessages, toolSchemas, acc, round),
            defer(() => decideAfterStream$(acc, turn, {round, retried}))
        )
    }

    function messagesWithHint(baseMessages, retryHint) {
        return retryHint
            ? [...baseMessages, {role: 'system', content: retryHint}]
            : baseMessages
    }

    function decideAfterStream$(acc, turn, {round, retried}) {
        const outcome = classifyRound(acc)
        if (outcome.type === 'tool-requested') {
            return handleToolCalls$(outcome.text, outcome.calls, turn, {round})
        }
        // Empty after a tool result usually means the model gave up without explanation.
        // Retry once with a hint, tools still available — the guard blocks exact repeats so
        // the model gets one structured chance to correct args or retry after validation.
        if (outcome.type === 'silent' && isPostToolRound() && !retried) {
            publishEmptyLlmRetry({
                bus, conversationId: id, round, messages, exposedTools: turn.lastExposedTools
            })
            return step$(turn, {round: round + 1, retried: true, retryHint: EMPTY_AFTER_TOOL_HINT})
        }
        return reply$(outcome.text, {round, turn})
    }

    function isPostToolRound() {
        return messages.at(-1)?.role === 'tool'
    }

    function llmStream$(llmMessages, toolSchemas, acc, round) {
        return bus.track$('llm.respondTo', {messageCount: llmMessages.length},
            llm.respondTo$({
                messages: llmMessages,
                tools: toolSchemas,
                debugLabel: `orchestrator ${id} round ${round}`,
                usageContext: {role: 'orchestrator', conversationId: id}
            }).pipe(
                tap(event => {
                    if (event.textDelta) acc.text += event.textDelta
                    if (event.toolCall) {
                        acc.toolCalls = [...acc.toolCalls, event.toolCall]
                        publishToolCall({bus, diagnostics, conversationId: id, round, toolCall: event.toolCall})
                    }
                }),
                filter(event => event.textDelta != null)
            )
        )
    }

    function handleToolCalls$(text, toolCalls, turn, {round}) {
        const collected = {results: []}
        return concat(
            append$({role: 'assistant', content: text || '', toolCalls}).pipe(ignoreElements()),
            from(toolCalls).pipe(concatMap(toolCall => invokeTool$(toolCall, turn, collected))),
            defer(() => append$({role: 'tool', toolResults: collected.results}).pipe(ignoreElements())),
            defer(() => decideAfterTools$(collected, turn, {round}))
        )
    }

    // Stop policy after a tool round: a single directAnswer tool short-circuits
    // to its own prose; a guard bail or the round cap ends the turn with a
    // terminal notice; otherwise continue into the next round.
    function decideAfterTools$(collected, turn, {round}) {
        const directAnswer = directToolAnswer(collected.results, tools)
        if (directAnswer) return directReply$(directAnswer)
        const bailDisplay = turn.guard.bail()
        if (bailDisplay) return notices.guardBail$(bailDisplay)
        return round + 1 >= MAX_TOOL_ROUNDS
            ? notices.toolRoundCapReached$(MAX_TOOL_ROUNDS)
            : step$(turn, {round: round + 1})
    }

    function invokeTool$(toolCall, turn, collected) {
        const ref = {toolCallId: toolCall.id, toolName: toolCall.name}
        const blocked = turn.guard.blockedRepeat(toolCall)
        const stream$ = blocked
            ? of(blocked)
            : bus.track$('tool.invoke', {toolName: toolCall.name}, tools.invoke$(toolCall, turn.toolContext)).pipe(
                tap(value => { if (!isChannelEmission(value)) turn.guard.record(toolCall, value) })
            )
        return concat(
            of({toolStart: {...ref, input: toolCall.input}}),
            stream$.pipe(
                mergeMap(value => {
                    if (isChannelEmission(value)) return of(value)
                    // collected.results is the persisted shape; the load path rebuilds from it.
                    // toolStart/toolEnd carry input/data/error for live display only.
                    collected.results.push({...ref, result: value})
                    return of({toolEnd: {...ref, ok: value.ok, data: value.data, error: value.error}})
                })
            )
        )
    }

    function directReply$(text) {
        return concat(
            of({textDelta: text}),
            append$({role: 'assistant', content: text}).pipe(ignoreElements())
        )
    }

    function reply$(text, {round, turn}) {
        if (!hasVisibleText(text)) {
            publishEmptyLlmReply({
                bus, conversationId: id, round, messages, exposedTools: turn.lastExposedTools
            })
        }
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

function hasVisibleText(text) {
    return typeof text === 'string' && text.trim().length > 0
}

function classifyRound(acc) {
    if (acc.toolCalls.length > 0) return {type: 'tool-requested', text: acc.text, calls: acc.toolCalls}
    if (hasVisibleText(acc.text)) return {type: 'answered', text: acc.text}
    return {type: 'silent', text: acc.text}
}

function directToolAnswer(toolResults, tools) {
    if (toolResults.length !== 1) return null
    const [result] = toolResults
    if (!tools.flag(result.toolName, 'directAnswer')) return null
    // A directAnswer tool owns its user-facing prose on both paths: success
    // streams data.answer; a failure that carries error.answer (e.g. an update
    // rejected by validation) streams that reason straight to the user rather
    // than provoking an orchestrator restate that can stall.
    const answer = result.result?.ok === true ? result.result?.data?.answer : result.result?.error?.answer
    return hasVisibleText(answer) ? answer.trim() : null
}

module.exports = {createConversationLoop, MAX_TOOL_ROUNDS}
