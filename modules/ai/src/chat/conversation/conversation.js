// Single conversation entity: identity, turn queue, abort. Wraps a
// conversationLoop with serialization so concurrent sends can't
// interleave.

const {EMPTY, Subject, catchError, concat, defer, finalize, ignoreElements, shareReplay, takeUntil} = require('rxjs')
const {createConversationLoop} = require('./conversationLoop')

function createConversation({id, initialMessages = [], llm, history, tools, tracer, bus}) {
    const loop = createConversationLoop({id, initialMessages, llm, history, tools, tracer, bus})
    const abortRequests$ = new Subject()
    let tail$ = EMPTY
    let streaming = false

    return {
        id,
        sendUserMessage$,
        abort,
        messagesSnapshot: loop.messagesSnapshot,
        get isStreaming() { return streaming }
    }

    // Serialize turns: chain onto the previous turn's tail so concurrent
    // sends can't interleave on the loop's shared messages array. takeUntil
    // is inside the per-turn defer so abort fires for the currently-running
    // turn only — queued turns subscribe to a fresh takeUntil when they
    // start.
    function sendUserMessage$(text, opts = {}) {
        const previousTail$ = tail$
        const turn$ = concat(
            previousTail$.pipe(ignoreElements(), catchError(() => EMPTY)),
            defer(() => {
                streaming = true
                return loop.runTurn$(text, opts).pipe(
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
