import {jest} from '@jest/globals'
import {Subject} from 'rxjs'

import {QUEUE, SESSION_APP_DISSOCIATED_TOPIC, sessionAppDissociatedSubscriber} from './sessionAppDissociatedSubscriber.js'

describe('sessionAppDissociatedSubscriber', () => {
    const manager = () => ({onAppDissociated: jest.fn()})

    test('exposes the queue and topic for initMessageQueue', () => {
        const {queue, topic} = sessionAppDissociatedSubscriber(manager())
        expect(queue).toBe(QUEUE)
        expect(topic).toBe(SESSION_APP_DISSOCIATED_TOPIC)
    })

    test('drops the cached app entry on every dissociation', () => {
        const mgr = manager()
        const {handler} = sessionAppDissociatedSubscriber(mgr)
        handler(SESSION_APP_DISSOCIATED_TOPIC, {username: 'bob', sessionId: 's-1', path: '/sandbox/shiny/foo'})
        expect(mgr.onAppDissociated).toHaveBeenCalledWith({username: 'bob', appPath: '/sandbox/shiny/foo'})
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
        expect(events).toEqual([{
            type: 'appSessionDissociated',
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
        expect(events).toEqual([])
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
        expect(events).toEqual([])
    })

    test('tolerates a malformed payload', () => {
        const mgr = manager()
        const {handler} = sessionAppDissociatedSubscriber(mgr, new Subject())
        expect(() => handler(SESSION_APP_DISSOCIATED_TOPIC, null)).not.toThrow()
        expect(mgr.onAppDissociated).toHaveBeenCalledWith({username: undefined, appPath: undefined})
    })
})
