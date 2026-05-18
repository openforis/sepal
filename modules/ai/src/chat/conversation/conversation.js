// Per-conversation turn loop, queue, and abort. Owns the messages array,
// feeds the LLM, dispatches tool calls (capped at MAX_TOOL_ROUNDS,
// guarded by toolCallGuard), and persists each new message through the
// injected history collaborator. send$ serializes turns for this
// conversation so concurrent sends can't interleave on the shared
// messages array; abort() cancels the in-flight turn.

const {EMPTY, Subject, catchError, concat, concatMap, defer, filter, finalize, from, ignoreElements, mergeMap, of, shareReplay, takeUntil, tap} = require('rxjs')
const {messagesForLlm} = require('./llmMessages')
const {publishHistoryProjection, publishLlmRequest, publishToolCall} = require('./conversationEvents')
const {createToolCallGuard} = require('../toolCallGuard')
const {isChannelEmission} = require('../channelEvents')

const MAX_TOOL_ROUNDS = 8
const TOOL_ROUND_CAP_MESSAGE = 'This is taking more steps than expected, so I\'ve stopped here. Please try rephrasing your request.'
const TOOL_CONSECUTIVE_FAILURES_MESSAGE = 'Having repeated trouble with that tool. Please try a different approach.'
const TOOL_INVALID_ARGS_MESSAGE = 'Could not work out the right inputs for that tool. Please try a different approach.'
const NOOP_BUS = {publish() {}}

function createConversation({llm, history, tools, tracer, initialMessages = [], id, bus = NOOP_BUS}) {
    const messages = [...initialMessages] // Mutable
    const abortRequests$ = new Subject()
    let tail$ = EMPTY
    let streaming = false

    return {
        id,
        sendUserMessage$,
        abort,
        messagesSnapshot,
        get isStreaming() { return streaming }
    }

    function messagesSnapshot() {
        return [...messages]
    }

    // Serialize turns: chain onto the previous turn's tail so concurrent
    // sends can't interleave on the shared messages array. takeUntil is
    // inside the per-turn defer so abort fires for the currently-running
    // turn only — queued turns subscribe to a fresh takeUntil when they
    // start.
    function sendUserMessage$(text, {selection, toolContext} = {}) {
        const previousTail$ = tail$
        const turn$ = concat(
            previousTail$.pipe(ignoreElements(), catchError(() => EMPTY)),
            defer(() => {
                streaming = true
                return runTurn$(text, {selection, toolContext}).pipe(
                    takeUntil(abortRequests$),
                    finalize(() => { streaming = false })
                )
            })
        ).pipe(
            finalize(() => {
                if (tail$ === turn$) tail$ = EMPTY
            }),
            shareReplay({bufferSize: 1, refCount: false})
        )
        tail$ = turn$
        return turn$
    }

    function abort() {
        if (streaming) abortRequests$.next()
    }

    function runTurn$(text, {selection, toolContext}) {
        const guard = createToolCallGuard({consecutiveFailureBail, invalidArgsBail})
        return tracer.span$('conversation.send', {conversationId: id},
            append$({role: 'user', content: text}).pipe(
                concatMap(() => step$({selection, includeTurnContext: true, toolContext, round: 0, guard}))
            )
        )
    }

    function step$({selection, includeTurnContext, toolContext, round, guard}) {
        const acc = {text: '', toolCalls: []}
        const {llmMessages, projection} = messagesForLlm({
            messages, selection, includeTurnContext, isolateHistory: round > 0
        })
        const toolSchemas = tools.schemas()
        publishHistoryProjection({bus, conversationId: id, projection})
        publishLlmRequest({bus, conversationId: id, round, llmMessages, toolSchemas})
        const after$ = defer(() => {
            const llmRequestedTools = acc.toolCalls.length > 0
            return llmRequestedTools
                ? handleToolCalls$(acc.text, acc.toolCalls, {toolContext, round, guard})
                : reply$(acc.text)
        })
        return concat(llmStream$(llmMessages, toolSchemas, acc, round), after$)
    }

    function llmStream$(llmMessages, toolSchemas, acc, round) {
        return tracer.span$('llm.respondTo', {messageCount: llmMessages.length},
            llm.respondTo$({messages: llmMessages, tools: toolSchemas}).pipe(
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

    function handleToolCalls$(text, toolCalls, {toolContext, round, guard}) {
        const collected = {results: []}
        return concat(
            append$({role: 'assistant', content: text || '', toolCalls}).pipe(ignoreElements()),
            from(toolCalls).pipe(concatMap(toolCall => invokeTool$(toolCall, {toolContext, collected, guard}))),
            defer(() => append$({role: 'tool', toolResults: collected.results}).pipe(ignoreElements())),
            defer(() => {
                const bailDisplay = guard.bail()
                if (bailDisplay) return terminalNotice$('conversation.toolBail', bailDisplay, {conversationId: id, displayKey: bailDisplay.key})
                const capReached = round + 1 >= MAX_TOOL_ROUNDS
                return capReached
                    ? toolRoundCapReached$()
                    : step$({toolContext, round: round + 1, guard})
            })
        )
    }

    function invokeTool$(toolCall, {toolContext, collected, guard}) {
        const ref = {toolCallId: toolCall.id, toolName: toolCall.name}
        const blocked = guard.blockedRepeat(toolCall)
        const stream$ = blocked
            ? of(blocked)
            : tracer.span$('tool.invoke', {toolName: toolCall.name}, tools.invoke$(toolCall, toolContext)).pipe(
                tap(value => { if (!isChannelEmission(value)) guard.record(toolCall, value) })
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

    function toolRoundCapReached$() {
        const display = {
            key: 'home.chat.notices.toolRoundCap',
            args: {max: MAX_TOOL_ROUNDS},
            fallback: TOOL_ROUND_CAP_MESSAGE
        }
        return terminalNotice$('conversation.toolRoundCapReached', display, {conversationId: id, maxRounds: MAX_TOOL_ROUNDS})
    }

    function terminalNotice$(spanName, display, spanAttrs) {
        const message = {role: 'assistant', content: display.fallback, display}
        return tracer.span$(spanName, spanAttrs,
            concat(
                of({notice: {content: display.fallback, display}}),
                append$(message).pipe(ignoreElements())
            )
        )
    }

    function reply$(text) {
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

// args.tool is available to translators and to history/debug inspection;
// the current English copy interpolates only {max}.
function consecutiveFailureBail(tool, max) {
    return {
        key: 'home.chat.notices.toolConsecutiveFailures',
        args: {tool, max},
        fallback: TOOL_CONSECUTIVE_FAILURES_MESSAGE
    }
}

function invalidArgsBail(tool, max) {
    return {
        key: 'home.chat.notices.toolInvalidArgs',
        args: {tool, max},
        fallback: TOOL_INVALID_ARGS_MESSAGE
    }
}

module.exports = {createConversation, MAX_TOOL_ROUNDS}
