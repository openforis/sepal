import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {Subject} from 'rxjs'

import {callsOf} from '#sepal/testSupport/mock'

import {QUEUE, SESSION_APP_DISSOCIATED_TOPIC, sessionAppDissociatedSubscriber} from './sessionAppDissociatedSubscriber.js'

describe('sessionAppDissociatedSubscriber', () => {
    const manager = () => ({onAppDissociated: mock.fn()})

    test('exposes the queue and topic for initMessageQueue', () => {
        const {queue, topic} = sessionAppDissociatedSubscriber(manager())
        assert.equal(queue, QUEUE)
        assert.equal(topic, SESSION_APP_DISSOCIATED_TOPIC)
    })

    test('drops the cached app entry on every dissociation', () => {
        const mgr = manager()
        const {handler} = sessionAppDissociatedSubscriber(mgr)
        handler(SESSION_APP_DISSOCIATED_TOPIC, {username: 'bob', sessionId: 's-1', path: '/sandbox/shiny/foo'})
        assert.deepEqual(
            callsOf(mgr.onAppDissociated),
            [[{username: 'bob', appPath: '/sandbox/shiny/foo'}]]
        )
    })

    test('notifies the OWNER client when someone else dissociated its app (takeover)', () => {
        const event$ = new Subject()
        const events = []
        event$.subscribe(event => events.push(event))
        const {handler} = sessionAppDissociatedSubscriber(manager(), event$)
        handler(SESSION_APP_DISSOCIATED_TOPIC, {
            username: 'bob', sessionId: 's-1', path: '/sandbox/shiny/foo',
            clientId: 'c-owner', requestingClientId: 'c-other'
        })
        assert.deepEqual(events, [{
            type: 'workerSessionAppDissociated',
            data: {username: 'bob', clientId: 'c-owner', appPath: '/sandbox/shiny/foo', sessionId: 's-1'}
        }])
    })

    test('suppresses the notification when the owner dissociated its own app (tab close, clientDown)', () => {
        const event$ = new Subject()
        const events = []
        event$.subscribe(event => events.push(event))
        const {handler} = sessionAppDissociatedSubscriber(manager(), event$)
        handler(SESSION_APP_DISSOCIATED_TOPIC, {
            username: 'bob', sessionId: 's-1', path: '/sandbox/shiny/foo',
            clientId: 'c-1', requestingClientId: 'c-1'
        })
        assert.deepEqual(events, [])
    })

    test('suppresses the notification for ownerless associations', () => {
        const event$ = new Subject()
        const events = []
        event$.subscribe(event => events.push(event))
        const {handler} = sessionAppDissociatedSubscriber(manager(), event$)
        handler(SESSION_APP_DISSOCIATED_TOPIC, {
            username: 'bob', sessionId: 's-1', path: '/sandbox/shiny/foo',
            clientId: null, requestingClientId: 'c-other'
        })
        assert.deepEqual(events, [])
    })

    test('tolerates a malformed payload', () => {
        const mgr = manager()
        const {handler} = sessionAppDissociatedSubscriber(mgr, new Subject())
        assert.doesNotThrow(() => handler(SESSION_APP_DISSOCIATED_TOPIC, null))
        assert.deepEqual(
            callsOf(mgr.onAppDissociated),
            [[{username: undefined, appPath: undefined}]]
        )
    })
})
