import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {Subject} from 'rxjs'

import {WORKER_SESSION_CLOSED} from '#sepal/event/definitions'
import {callsOf} from '#sepal/testSupport/mock'

import {QUEUE, WORKER_SESSION_CLOSED_TOPIC, workerSessionClosedSubscriber} from './workerSessionClosedSubscriber.js'

describe('workerSessionClosedSubscriber', () => {
    test('exposes queue + topic matching the worker publisher', () => {
        const {queue, topic} = workerSessionClosedSubscriber({onSessionClosed: () => {}})
        assert.equal(queue, QUEUE)
        assert.equal(topic, WORKER_SESSION_CLOSED_TOPIC)
        assert.equal(topic, 'workerSession.WorkerSessionClosed')
    })

    test('handler forwards {username, sessionId} to onSessionClosed', () => {
        const onSessionClosed = mock.fn()
        const {handler} = workerSessionClosedSubscriber({onSessionClosed})
        handler('workerSession.WorkerSessionClosed', {username: 'alice', sessionId: 's1'})
        assert.deepEqual(callsOf(onSessionClosed), [[{username: 'alice', sessionId: 's1'}]])
    })

    test('handler tolerates missing content', () => {
        const onSessionClosed = mock.fn()
        const {handler} = workerSessionClosedSubscriber({onSessionClosed})
        handler('workerSession.WorkerSessionClosed', undefined)
        assert.deepEqual(callsOf(onSessionClosed), [[{username: undefined, sessionId: undefined}]])
    })

    test('handler emits a workerSessionClosed event on event$', () => {
        const onSessionClosed = mock.fn()
        const event$ = new Subject()
        const events = []
        event$.subscribe(event => events.push(event))
        const {handler} = workerSessionClosedSubscriber({onSessionClosed}, event$)
        handler('workerSession.WorkerSessionClosed', {username: 'bob', sessionId: 's-1'})
        assert.deepEqual(
            events,
            [{type: WORKER_SESSION_CLOSED, data: {username: 'bob', sessionId: 's-1'}}]
        )
    })

    test('handler emits NO event for a malformed payload (would broadcast to all users)', () => {
        const event$ = new Subject()
        const events = []
        event$.subscribe(event => events.push(event))
        const {handler} = workerSessionClosedSubscriber({onSessionClosed: mock.fn()}, event$)
        handler('workerSession.WorkerSessionClosed', {}) // no username / sessionId
        handler('workerSession.WorkerSessionClosed', undefined) // missing content
        handler('workerSession.WorkerSessionClosed', {sessionId: 's-1'}) // sessionId only, no username
        handler('workerSession.WorkerSessionClosed', {username: 'bob'}) // username only, no sessionId
        assert.deepEqual(events, [])
    })

    test('handler still tears down the session for a partial payload', () => {
        const onSessionClosed = mock.fn()
        const {handler} = workerSessionClosedSubscriber({onSessionClosed})
        handler('workerSession.WorkerSessionClosed', {sessionId: 's-1'})
        assert.deepEqual(callsOf(onSessionClosed), [[{username: undefined, sessionId: 's-1'}]])
    })
})
