import {EventEmitter} from 'events'
import {Observable} from 'rxjs'

import {resolveStream} from '#sepal/httpServer/stream'

// `ServerResponse.close` is the per-response lifecycle signal: the response completed, or the connection went
// away before it could. `IncomingMessage.close` is not - it fires on every normal request.
//
// Cancellation is Observable teardown: unsubscribing is what reaches the scheduler, the worker and the Earth
// Engine batch task. The source here is deliberately an ordinary cold Observable, because `ctx.result$` is
// declared as one and nothing may assume it is a Subject with a `complete()` to call.
const context = () => {
    const req = new EventEmitter()
    req.socket = new EventEmitter()
    return {req, res: new EventEmitter()}
}

// A cold source that reports when it has been subscribed, hands back its subscriber, and counts teardowns.
const source = () => {
    const state = {teardowns: 0}
    state.pending = new Promise(resolve => {
        state.result$ = new Observable(observer => {
            state.subscriber = observer
            resolve()
            return () => {
                state.teardowns++
            }
        })
    })
    return state
}

// Runs the middleware over a source, reporting when it settles.
const run = (ctx, result$) => {
    const state = {settled: false}
    state.middleware = resolveStream()(ctx, async () => {
        ctx.result$ = result$
    }).then(() => {
        state.settled = true
    })
    return state
}

const turn = () => new Promise(resolve => setImmediate(resolve))

describe('a pending HTTP response that closes', () => {
    it('cancels the result stream when the pending response closes', async () => {
        const result = source()
        const ctx = context()
        const middleware = run(ctx, result.result$)

        // The result is genuinely pending - subscribed, and nothing emitted yet - before the client goes away.
        await result.pending
        ctx.res.emit('close')
        await turn()

        const afterClose = {teardowns: result.teardowns, settled: middleware.settled, cancelled: ctx.cancelled}

        // Only so a still-subscribed implementation cannot hang the run; the assertions are about the state
        // above, recorded before this.
        result.subscriber.complete()
        await middleware.middleware

        expect(afterClose.teardowns).toBe(1)
        expect(afterClose.settled).toBe(true)
        expect(afterClose.cancelled).toBe(true)
        // Cancelling once is the whole point: a second teardown would mean the listener outlived the result.
        expect(result.teardowns).toBe(1)
    })

    // A value already emitted is not a result: the cardinality pipeline had not finished deciding, and nobody
    // is left to read it. Committing it would answer a request the client abandoned.
    it('does not commit a value emitted before the close', async () => {
        const result = source()
        const ctx = context()
        const middleware = run(ctx, result.result$)

        await result.pending
        result.subscriber.next({partial: true})
        ctx.res.emit('close')
        await turn()

        expect(result.teardowns).toBe(1)
        expect(middleware.settled).toBe(true)
        expect(ctx.cancelled).toBe(true)
        // Not merely undefined: nothing is ASSIGNED. Writing an undefined body to a real response would set
        // its status, which is a reply to a request nobody is waiting for.
        expect('body' in ctx).toBe(false)

        result.subscriber.complete()
        await middleware.middleware
        expect(result.teardowns).toBe(1)
    })

    // Cancellation has to unsubscribe BEFORE the cardinality check. A pipeline that instead completed its
    // buffer would hand two pending values to that check and turn an abandoned request into a 500.
    it('does not turn a cancelled request into an error', async () => {
        const result = source()
        const ctx = context()
        const middleware = run(ctx, result.result$)

        await result.pending
        result.subscriber.next({partial: 1})
        result.subscriber.next({partial: 2})
        ctx.res.emit('close')
        await turn()

        expect(ctx.cancelled).toBe(true)
        expect(middleware.settled).toBe(true)
        expect(ctx.status).toBeUndefined()
        expect('body' in ctx).toBe(false)

        result.subscriber.complete()
        await middleware.middleware
        expect(result.teardowns).toBe(1)
    })
})

describe('a normal HTTP result', () => {
    it('writes a single value as the body, and is not cancelled', async () => {
        const result = source()
        const ctx = context()
        const middleware = run(ctx, result.result$)

        await result.pending
        result.subscriber.next({value: 42})
        result.subscriber.complete()
        await middleware.middleware

        expect(ctx.body).toEqual({value: 42})
        expect(ctx.cancelled).not.toBe(true)
        expect(result.teardowns).toBe(1)
    })

    // The response listener goes with the subscription, so a close that arrives after the work is done cannot
    // retrospectively cancel it.
    it('is unaffected by a response close after it settled', async () => {
        const result = source()
        const ctx = context()
        const middleware = run(ctx, result.result$)

        await result.pending
        result.subscriber.next({value: 42})
        result.subscriber.complete()
        await middleware.middleware

        ctx.res.emit('close')
        await turn()

        expect(ctx.body).toEqual({value: 42})
        expect(ctx.cancelled).not.toBe(true)
        expect(result.teardowns).toBe(1)
    })

    it('leaves the body undefined for a result with no value', async () => {
        const result = source()
        const ctx = context()
        const middleware = run(ctx, result.result$)

        await result.pending
        result.subscriber.complete()
        await middleware.middleware

        expect(ctx.body).toBeUndefined()
        expect(ctx.cancelled).not.toBe(true)
    })

    // A server error is reported as a status and a formatted body carrying the GENERIC user message: the
    // internal detail stays in the log, not in the response.
    it('reports an error as a status and a formatted body', async () => {
        const result = source()
        const ctx = context()
        const middleware = run(ctx, result.result$)

        await result.pending
        result.subscriber.error(new Error('Boom'))
        await middleware.middleware

        expect(ctx.status).toBe(500)
        expect(ctx.body).toMatchObject({defaultMessage: 'Internal error'})
        expect(ctx.body.defaultMessage).not.toContain('Boom')
        expect(ctx.cancelled).not.toBe(true)
    })

    it('rejects more than one value', async () => {
        const result = source()
        const ctx = context()
        const middleware = run(ctx, result.result$)

        await result.pending
        result.subscriber.next({value: 1})
        result.subscriber.next({value: 2})
        result.subscriber.complete()
        await middleware.middleware

        expect(ctx.status).toBe(500)
        expect(ctx.body).toMatchObject({defaultMessage: 'Internal error'})
    })
})

// The incoming request finishing being received says nothing about whether anyone is still listening.
describe('an incoming request that closes', () => {
    it('does not cancel or settle a pending result', async () => {
        const result = source()
        const ctx = context()
        const middleware = run(ctx, result.result$)

        await result.pending
        ctx.req.emit('close')
        ctx.req.socket.emit('close')
        await turn()

        expect(result.teardowns).toBe(0)
        expect(middleware.settled).toBe(false)
        expect(ctx.cancelled).not.toBe(true)

        // Released so the run stays deterministic; the result is still the one the client asked for.
        result.subscriber.next({value: 42})
        result.subscriber.complete()
        await middleware.middleware
        expect(ctx.body).toEqual({value: 42})
    })
})
