import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {describe, it} from 'node:test'

import {EMPTY, NEVER, Observable, throwError} from 'rxjs'

import {wsStream} from '#sepal/httpServer/stream'

describe('wsStream', () => {
    it('terminates the socket when the handler stream completes on subscription', () => {
        const ws = socket()

        wsStream(() => EMPTY)(ws)

        assert.equal(ws.terminated, true)
    })

    it('terminates the socket when the handler stream fails on subscription', () => {
        const ws = socket()

        wsStream(() => throwError(() => new Error('handler failed')))(ws)

        assert.equal(ws.terminated, true)
    })

    it('completes the inbound stream and unsubscribes the handler stream when the socket closes', () => {
        const ws = socket()
        const handler = {inboundCompleted: false, teardowns: 0}
        wsStream(({arg$}) => {
            arg$.subscribe({complete: () => handler.inboundCompleted = true})
            return new Observable(() => () => handler.teardowns++)
        })(ws)

        ws.emit('close')

        assert.equal(handler.inboundCompleted, true)
        assert.equal(handler.teardowns, 1)
    })

    it('forwards inbound messages to the handler and sends its values to the socket', () => {
        const ws = socket()
        const received = []
        wsStream(({arg$}) => {
            arg$.subscribe(message => received.push(message))
            return new Observable(observer => {
                observer.next({hello: 'client'})
                return NEVER.subscribe()
            })
        })(ws)

        ws.emit('message', Buffer.from(JSON.stringify({hello: 'server'})))

        assert.deepEqual(received, [{hello: 'server'}])
        assert.deepEqual(ws.sent, [JSON.stringify({hello: 'client'})])
    })
})

const socket = () => {
    const ws = new EventEmitter()
    ws.sent = []
    ws.terminated = false
    ws.send = data => ws.sent.push(data)
    ws.terminate = () => ws.terminated = true
    return ws
}
