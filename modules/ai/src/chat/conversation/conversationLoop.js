// Per-conversation LLM/tool loop. Owns the mutable messages array,
// runs each turn against the LLM and tools, and persists each
// appended message through history.

const {concat, concatMap, defer, filter, from, ignoreElements, mergeMap, of, tap} = require('rxjs')
const {messagesForLlm} = require('./llmMessages')
const {publishEmptyLlmReply, publishEmptyLlmRetry, publishHistoryProjection, publishLlmRequest, publishRetryToolCallsDropped, publishToolCall} = require('./conversationEvents')
const {createTerminalNotices, consecutiveFailureBail, invalidArgsBail} = require('./terminalNotices')
const {createToolCallGuard} = require('../toolCallGuard')
const {isChannelEmission} = require('../channelEvents')
const {turnContextMessage} = require('../turnContext')
const {emptyAfterToolHint} = require('../llmText/prompts')

const EMPTY_AFTER_TOOL_HINT = emptyAfterToolHint()

const MAX_TOOL_ROUNDS = 8

function createConversationLoop({id, initialMessages = [], llm, history, tools, tracer, bus}) {
    const messages = [...initialMessages] // Mutable
    const notices = createTerminalNotices({tracer, conversationId: id, append$})

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
        return tracer.span$('conversation.send', {conversationId: id},
            append$({role: 'user', content: text}).pipe(
                concatMap(() => step$(turn, {round: 0}))
            )
        )
    }

    function step$(turn, {round, retried, retryHint}) {
        const acc = {text: '', toolCalls: []}
        const {llmMessages: baseMessages, projection} = messagesForLlm({
            messages,
            contextMessage: round === 0 ? turn.contextMessage : null,
            isolateHistory: round > 0
        })
        const llmMessages = messagesWithHint(baseMessages, retryHint)
        const toolSchemas = toolsFor(retried)
        publishHistoryProjection({bus, conversationId: id, projection})
        publishLlmRequest({bus, conversationId: id, round, llmMessages, toolSchemas})
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

    // Retry rounds are final-answer-only: the empty-after-tool signal is itself
    // evidence the model isn't planning more tool work, and the failure mode the
    // hint addresses is "fall back to a read-only tool to look busy". Removing
    // the tool surface mechanically forces either text or an admitted gap.
    function toolsFor(retried) {
        return retried ? [] : tools.schemas()
    }

    function decideAfterStream$(acc, turn, {round, retried}) {
        // Retry rounds are text-only: ignore any toolCalls the model emits despite
        // tools:[] (the provider may not enforce it). Recording the dropped calls
        // surfaces model misbehavior without re-entering the tool loop.
        if (retried && acc.toolCalls.length > 0) {
            publishRetryToolCallsDropped({bus, conversationId: id, round, toolCalls: acc.toolCalls})
        } else if (acc.toolCalls.length > 0) {
            return handleToolCalls$(acc.text, acc.toolCalls, turn, {round})
        }
        // Empty after a tool result usually means the model gave up without explanation.
        // Retry once with a hint; if even that produces nothing, reply$ will publish the
        // final llmEmptyReply so the metric counts only user-visible failures.
        if (!hasVisibleText(acc.text) && isPostToolRound() && !retried) {
            publishEmptyLlmRetry({bus, conversationId: id, round})
            return step$(turn, {round: round + 1, retried: true, retryHint: EMPTY_AFTER_TOOL_HINT})
        }
        return reply$(acc.text, {round})
    }

    function isPostToolRound() {
        return messages.at(-1)?.role === 'tool'
    }

    function llmStream$(llmMessages, toolSchemas, acc, round) {
        return tracer.span$('llm.respondTo', {messageCount: llmMessages.length},
            llm.respondTo$({
                messages: llmMessages,
                tools: toolSchemas,
                debugLabel: `conversation ${id} round ${round}`
            }).pipe(
                tap(event => {
                    if (event.textDelta) acc.text += event.textDelta
                    if (event.toolCall) {
                        acc.toolCalls = [...acc.toolCalls, event.toolCall]
                        publishToolCall({bus, conversationId: id, round, toolCall: event.toolCall})
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
            defer(() => {
                const bailDisplay = turn.guard.bail()
                if (bailDisplay) return notices.guardBail$(bailDisplay)
                return round + 1 >= MAX_TOOL_ROUNDS
                    ? notices.toolRoundCapReached$(MAX_TOOL_ROUNDS)
                    : step$(turn, {round: round + 1})
            })
        )
    }

    function invokeTool$(toolCall, turn, collected) {
        const ref = {toolCallId: toolCall.id, toolName: toolCall.name}
        const blocked = turn.guard.blockedRepeat(toolCall)
        const stream$ = blocked
            ? of(blocked)
            : tracer.span$('tool.invoke', {toolName: toolCall.name}, tools.invoke$(toolCall, turn.toolContext)).pipe(
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

    function reply$(text, {round}) {
        if (!hasVisibleText(text)) {
            publishEmptyLlmReply({bus, conversationId: id, round, messages})
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

module.exports = {createConversationLoop, MAX_TOOL_ROUNDS}
