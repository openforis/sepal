import {
    emitSessionAppAssociated,
    emitSessionExpiryClosed,
    emitSessionExpiryNotified,
    emitWorkerSessionActivated,
    emitWorkerSessionClosed,
    sessionChanged$,
    WORKER_SESSION_PUBLISHERS,
    workerSessionEvents,
} from './events.js'

const collect = () => {
    const seen = []
    const subscription = sessionChanged$.subscribe(value => seen.push(value))
    return {seen, unsubscribe: () => subscription.unsubscribe()}
}

describe('sessionChanged$', () => {
    let collected

    beforeEach(() => {
        collected = collect()
    })

    afterEach(() => {
        collected.unsubscribe()
    })

    it('fires when a session is activated', () => {
        emitWorkerSessionActivated({username: 'alice', session: {id: 's-1'}})
        expect(collected.seen).toEqual([{username: 'alice'}])
    })

    it('fires when a session is closed', () => {
        emitWorkerSessionClosed({username: 'alice', sessionId: 's-1'})
        expect(collected.seen).toEqual([{username: 'alice'}])
    })

    it('fires when an app is associated with a session', () => {
        emitSessionAppAssociated({username: 'alice', sessionId: 's-1', path: '/sandbox/shiny/foo', label: 'Foo'})
        expect(collected.seen).toEqual([{username: 'alice'}])
    })

    // A malformed event with no username would otherwise push a report for "everyone" — the ws
    // registry treats the username as the multicast selector.
    it('does not fire without a username', () => {
        emitWorkerSessionClosed({sessionId: 's-1'})
        expect(collected.seen).toEqual([])
    })

    it('fires when a session expiry is notified', () => {
        emitSessionExpiryNotified({username: 'alice', session: {id: 's-1', apiKey: null}})
        expect(collected.seen).toEqual([{username: 'alice'}])
    })
})

describe('SessionExpiryClosed', () => {
    it('carries the instance name and type through to the bus', () => {
        const publisher = WORKER_SESSION_PUBLISHERS
            .find(({key}) => key === 'workerSession.SessionExpiryClosed')
        const published = []
        const subscription = publisher.publish$.subscribe(value => published.push(value))
        emitSessionExpiryClosed({
            username: 'alice', sessionId: 's-1', name: 'crazy-banana', typeName: 't3a.small'})
        subscription.unsubscribe()
        expect(published[0]).toMatchObject({name: 'crazy-banana', typeName: 't3a.small'})
    })

    it('publishes {username, sessionId, apps, terminals, ordinal, instanceName}', () => {
        const publisher = WORKER_SESSION_PUBLISHERS
            .find(({key}) => key === 'workerSession.SessionExpiryClosed')
        expect(publisher).toBeDefined()
        const published = []
        const subscription = publisher.publish$.subscribe(value => published.push(value))
        const inProc = []
        const listener = payload => inProc.push(payload)
        workerSessionEvents.on('SessionExpiryClosed', listener)
        emitSessionExpiryClosed({username: 'alice', sessionId: 's-1'})
        subscription.unsubscribe()
        workerSessionEvents.off('SessionExpiryClosed', listener)
        // apps/terminals/ordinal/instanceName describe what was closed, so the GUI can replace its
        // warning with an accurate past-tense message. They default rather than being required.
        const expected = {
            username: 'alice', sessionId: 's-1',
            apps: [], terminals: 0, ordinal: null, name: null, typeName: null,
        }
        expect(published).toEqual([expected])
        expect(inProc).toEqual([expected])
    })
})

describe('SessionExpiryNotified', () => {
    // The emitter rebuilds the payload from an explicit allow-list, so a field the caller passes
    // is silently dropped unless it is named here. That is exactly how the instance name went
    // missing from the in-app notification while the email still had it.
    it('carries the instance name and type through to the bus', () => {
        const publisher = WORKER_SESSION_PUBLISHERS
            .find(({key}) => key === 'workerSession.SessionExpiryNotified')
        const published = []
        const subscription = publisher.publish$.subscribe(value => published.push(value))
        emitSessionExpiryNotified({
            username: 'alice',
            session: {id: 's-1', username: 'alice', apiKey: null},
            name: 'crazy-banana',
            typeName: 't3a.small',
        })
        subscription.unsubscribe()
        expect(published[0]).toMatchObject({name: 'crazy-banana', typeName: 't3a.small'})
    })

    it('publishes {username, sessionId, session} on the bus subject and the in-proc emitter', () => {
        const publisher = WORKER_SESSION_PUBLISHERS
            .find(({key}) => key === 'workerSession.SessionExpiryNotified')
        expect(publisher).toBeDefined()
        const published = []
        const subscription = publisher.publish$.subscribe(value => published.push(value))
        const inProc = []
        const listener = payload => inProc.push(payload)
        workerSessionEvents.on('SessionExpiryNotified', listener)
        const session = {id: 's-1', username: 'alice', apiKey: null}
        emitSessionExpiryNotified({username: 'alice', session})
        subscription.unsubscribe()
        workerSessionEvents.off('SessionExpiryNotified', listener)
        const expected = {
            username: 'alice', sessionId: 's-1', session,
            apps: [], terminals: 0, ordinal: null, name: null, typeName: null, extensionMinutes: null,
        }
        expect(published).toEqual([expected])
        expect(inProc).toEqual([expected])
    })
})
