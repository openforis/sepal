import {jest} from '@jest/globals'
import {Subject} from 'rxjs'

import {WORKER_SESSION_CLOSED} from '#sepal/event/definitions'

import {QUEUE, WORKER_SESSION_CLOSED_TOPIC, workerSessionClosedSubscriber} from './workerSessionClosedSubscriber.js'

describe('workerSessionClosedSubscriber', () => {
    test('exposes queue + topic matching the worker publisher', () => {
        const {queue, topic} = workerSessionClosedSubscriber({onSessionClosed: () => {}})
        expect(queue).toBe(QUEUE)
        expect(topic).toBe(WORKER_SESSION_CLOSED_TOPIC)
        expect(topic).toBe('workerSession.WorkerSessionClosed')
    })

    test('handler forwards {username, sessionId} to onSessionClosed', () => {
        const onSessionClosed = jest.fn()
        const {handler} = workerSessionClosedSubscriber({onSessionClosed})
        handler('workerSession.WorkerSessionClosed', {username: 'alice', sessionId: 's1'})
        expect(onSessionClosed).toHaveBeenCalledWith({username: 'alice', sessionId: 's1'})
    })

    test('handler tolerates missing content', () => {
        const onSessionClosed = jest.fn()
        const {handler} = workerSessionClosedSubscriber({onSessionClosed})
        handler('workerSession.WorkerSessionClosed', undefined)
        expect(onSessionClosed).toHaveBeenCalledWith({username: undefined, sessionId: undefined})
    })

    test('handler emits a workerSessionClosed event on event$', () => {
        const onSessionClosed = jest.fn()
        const event$ = new Subject()
        const events = []
        event$.subscribe(event => events.push(event))
        const {handler} = workerSessionClosedSubscriber({onSessionClosed}, event$)
        handler('workerSession.WorkerSessionClosed', {username: 'bob', sessionId: 's-1'})
        expect(events).toEqual([{type: WORKER_SESSION_CLOSED, data: {username: 'bob', sessionId: 's-1'}}])
    })

    test('handler emits NO event for a malformed payload (would broadcast to all users)', () => {
        const event$ = new Subject()
        const events = []
        event$.subscribe(event => events.push(event))
        const {handler} = workerSessionClosedSubscriber({onSessionClosed: jest.fn()}, event$)
        handler('workerSession.WorkerSessionClosed', {}) // no username / sessionId
        handler('workerSession.WorkerSessionClosed', undefined) // missing content
        handler('workerSession.WorkerSessionClosed', {sessionId: 's-1'}) // sessionId only, no username
        handler('workerSession.WorkerSessionClosed', {username: 'bob'}) // username only, no sessionId
        expect(events).toEqual([])
    })

    test('handler still tears down the session for a partial payload', () => {
        const onSessionClosed = jest.fn()
        const {handler} = workerSessionClosedSubscriber({onSessionClosed})
        handler('workerSession.WorkerSessionClosed', {sessionId: 's-1'})
        expect(onSessionClosed).toHaveBeenCalledWith({username: undefined, sessionId: 's-1'})
    })
})
