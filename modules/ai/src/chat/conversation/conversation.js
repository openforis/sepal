// Single conversation entity: identity, turn queue, abort. Wraps a
// conversationLoop with serialization so concurrent sends can't
// interleave.

const {EMPTY, Subject, catchError, concat, defer, finalize, ignoreElements, shareReplay, takeUntil} = require('rxjs')
const {createConversationLoop} = require('./conversationLoop')
const {createDiagnostics} = require('../diagnostics')

const DEFAULT_DIAGNOSTICS = createDiagnostics()

function createConversation({id, initialMessages = [], llm, history, tools, pendingActions, bus, diagnostics = DEFAULT_DIAGNOSTICS}) {
    const loop = createConversationLoop({id, initialMessages, llm, history, tools, pendingActions, bus, diagnostics})
    const abortRequests$ = new Subject()
    let tail$ = EMPTY
    let streaming = false

    return {
        id,
        sendUserMessage$,
        resumePendingTool$,
        abort,
        messagesSnapshot: loop.messagesSnapshot,
        get isStreaming() { return streaming }
    }

    // Serialize turns: chain onto the previous turn's tail so concurrent
    // sends can't interleave on the loop's shared messages array. The
    // abort signal only reaches the currently-running turn because
    // abortRequests$ is a non-replaying Subject and queued turns don't
    // subscribe to takeUntil until concat advances to them.
    function sendUserMessage$(text, opts = {}) {
        return enqueueTurn$(() => loop.runTurn$(text, opts))
    }

    // Resume from a pending-action answer: bypass the LLM and run a single
    // pre-determined tool round on the same turn queue, so a concurrent
    // user-message send still serializes correctly.
    function resumePendingTool$({toolCall, userAnswerText, toolContext}) {
        return enqueueTurn$(() => loop.runResumeTurn$({toolCall, userAnswerText, toolContext}))
    }

    function enqueueTurn$(runTurn$) {
        const previousTail$ = tail$
        const turn$ = concat(
            previousTail$.pipe(ignoreElements(), catchError(() => EMPTY)),
            defer(() => {
                streaming = true
                return runTurn$().pipe(
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
}

module.exports = {createConversation}
