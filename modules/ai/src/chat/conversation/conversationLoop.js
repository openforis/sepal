const {EMPTY, concat, concatMap, defer, filter, from, ignoreElements, mergeMap, of, tap} = require('rxjs')
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

function createConversationLoop({id, initialMessages = [], llm, history, tools, pendingActions, bus, diagnostics = DEFAULT_DIAGNOSTICS}) {
    const messages = [...initialMessages]
    const notices = createTerminalNotices({bus, conversationId: id, append$})

    return {runTurn$, runResumeTurn$, messagesSnapshot}

    function messagesSnapshot() {
        return messages.map(stripReasoning).filter(notEmptyAssistantTurn)
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

    function runResumeTurn$({toolCall, userAnswerText, toolContext}) {
        const turn = {
            toolContext,
            guard: createToolCallGuard({consecutiveFailureBail, invalidArgsBail}),
            contextMessage: null
        }
        return bus.track$('conversation.resume', {conversationId: id},
            append$({role: 'user', content: userAnswerText}).pipe(
                concatMap(() => handleToolCalls$('', [toolCall], turn, {round: 0}))
            )
        )
    }

    function step$(turn, {round, retried, retryHint, priorAssistantTurn}) {
        const acc = {text: '', toolCalls: [], reasoning: ''}
        const {llmMessages: baseMessages, projection} = messagesForLlm({
            messages,
            contextMessage: turn.contextMessage,
            isolateHistory: round > 0
        })
        const llmMessages = applyTransientCarriers(baseMessages, {priorAssistantTurn, retryHint})
        const toolSchemas = tools.schemas()
        turn.lastExposedTools = toolSchemas.map(schema => schema.name)
        publishStepDiagnostics({round, llmMessages, toolSchemas, projection})
        return concat(
            llmStream$(llmMessages, toolSchemas, acc, round),
            defer(() => decideAfterStream$(acc, turn, {round, retried}))
        )
    }

    function publishStepDiagnostics({round, llmMessages, toolSchemas, projection}) {
        publishHistoryProjection({bus, diagnostics, conversationId: id, projection})
        publishLlmRequest({bus, diagnostics, conversationId: id, round, llmMessages, toolSchemas})
        publishOrchestratorPrompt({bus, conversationId: id, round, llmMessages, toolSchemas})
    }

    function applyTransientCarriers(baseMessages, {priorAssistantTurn, retryHint}) {
        const withTurn = priorAssistantTurn ? [...baseMessages, priorAssistantTurn] : baseMessages
        return retryHint ? [...withTurn, {role: 'system', content: retryHint}] : withTurn
    }

    function decideAfterStream$(acc, turn, {round, retried}) {
        const outcome = classifyRound(acc)
        if (outcome.type === 'tool-requested') {
            return handleToolCalls$(outcome.text, outcome.calls, turn, {round, reasoning: outcome.reasoning})
        }
        if (outcome.type === 'silent' && isPostToolRound() && !retried) {
            publishEmptyLlmRetry({
                bus, conversationId: id, round, messages, exposedTools: turn.lastExposedTools
            })
            return step$(turn, {
                round: round + 1,
                retried: true,
                retryHint: EMPTY_AFTER_TOOL_HINT,
                priorAssistantTurn: silentReasoningCarrier(outcome)
            })
        }
        return reply$(outcome.text, {round, turn, reasoning: outcome.reasoning})
    }

    function silentReasoningCarrier(outcome) {
        if (!outcome.reasoning) return null
        return {role: 'assistant', content: outcome.text || '', reasoning: outcome.reasoning}
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
                    // Latest responseMeta wins — length-cap retries inside one
                    // respondTo$ call emit one per attempt; an empty later
                    // value must clear an earlier one.
                    if (event.responseMeta) acc.reasoning = event.responseMeta.reasoning || ''
                }),
                filter(event => event.textDelta != null)
            )
        )
    }

    function handleToolCalls$(text, toolCalls, turn, {round, reasoning}) {
        const collected = {results: []}
        const assistantMessage = {
            role: 'assistant',
            content: text || '',
            toolCalls,
            ...(reasoning ? {reasoning} : {})
        }
        return concat(
            append$(assistantMessage).pipe(ignoreElements()),
            from(toolCalls).pipe(concatMap(toolCall => invokeTool$(toolCall, turn, collected))),
            defer(() => append$({role: 'tool', toolResults: collected.results}).pipe(ignoreElements())),
            defer(() => decideAfterTools$(collected, turn, {round}))
        )
    }

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
                    collected.results.push({...ref, result: value})
                    return concat(
                        of({toolEnd: {...ref, ok: value.ok, data: value.data, error: value.error}}),
                        pendingActions.observeToolResult$({conversationId: id, toolCall, result: value})
                    )
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

    function reply$(text, {round, turn, reasoning}) {
        if (!hasVisibleText(text)) {
            publishEmptyLlmReply({
                bus, conversationId: id, round, messages, exposedTools: turn.lastExposedTools
            })
            return EMPTY
        }
        const message = {
            role: 'assistant',
            content: text,
            ...(reasoning ? {reasoning} : {})
        }
        return append$(message).pipe(ignoreElements())
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
    if (acc.toolCalls.length > 0) return {type: 'tool-requested', text: acc.text, calls: acc.toolCalls, reasoning: acc.reasoning}
    if (hasVisibleText(acc.text)) return {type: 'answered', text: acc.text, reasoning: acc.reasoning}
    return {type: 'silent', text: acc.text, reasoning: acc.reasoning}
}

function stripReasoning(message) {
    if (!message || typeof message !== 'object' || message.reasoning === undefined) return message
    const {reasoning: _reasoning, ...rest} = message
    return rest
}

function notEmptyAssistantTurn(message) {
    if (!message || message.role !== 'assistant') return true
    if (message.toolCalls && message.toolCalls.length) return true
    return hasVisibleText(message.content)
}

// A directAnswer tool streams its own user-facing text on both paths
// (data.answer on success, error.answer on failure) instead of provoking an
// orchestrator restate round.
function directToolAnswer(toolResults, tools) {
    if (toolResults.length !== 1) return null
    const [result] = toolResults
    if (!tools.flag(result.toolName, 'directAnswer')) return null
    const answer = result.result?.ok === true ? result.result?.data?.answer : result.result?.error?.answer
    return hasVisibleText(answer) ? answer.trim() : null
}

module.exports = {createConversationLoop, MAX_TOOL_ROUNDS}
