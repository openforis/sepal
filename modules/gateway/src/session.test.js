import {EventEmitter} from 'events'
import {Subject} from 'rxjs'

import {SessionManager} from './session.js'

// Every destroyed login session must be announced on event$, so the websocket layer can kick the
// browser tabs that authenticated with it. The store fake holds sessions the way connect-redis does:
// `all` lists them with their ids, `destroy` removes one.

describe('logout', () => {
    test('announces the destroyed session', async () => {
        const store = sessionStoreHolding({s1: 'alice'})
        const {manager, invalidated} = sessionManagerOver(store)

        await manager.logout(requestFor(store, 's1', 'alice'), aResponse())

        expect(store.ids()).toEqual([])
        expect(invalidated).toEqual([{username: 'alice', sessionId: 's1', reason: 'logout'}])
    })
})

describe('invalidateOtherSessions', () => {
    test('announces every other session of the user, not the caller\'s', async () => {
        const store = sessionStoreHolding({s1: 'alice', s2: 'alice', s3: 'bob'})
        const {manager, invalidated} = sessionManagerOver(store)

        await manager.invalidateOtherSessions(requestFor(store, 's1', 'alice'), aResponse())

        expect(store.ids()).toEqual(['s1', 's3'])
        expect(invalidated).toEqual([{username: 'alice', sessionId: 's2', reason: 'invalidated'}])
    })
})

describe('user.UserLocked', () => {
    test('announces every session of the locked user', async () => {
        const store = sessionStoreHolding({s1: 'alice', s2: 'alice', s3: 'bob'})
        const {manager, invalidated} = sessionManagerOver(store)

        await manager.messageHandler('user.UserLocked', {username: 'alice'})

        expect(store.ids()).toEqual(['s3'])
        expect(invalidated).toEqual([
            {username: 'alice', sessionId: 's1', reason: 'locked'},
            {username: 'alice', sessionId: 's2', reason: 'locked'}
        ])
    })
})

describe('ensureSessionFor', () => {
    test('replaces a session held by another user, announcing it once the response has gone out', async () => {
        const store = sessionStoreHolding({s1: 'alice'})
        const {manager, invalidated} = sessionManagerOver(store)
        const req = requestFor(store, 's1', 'alice')
        const res = aResponse()

        await manager.ensureSessionFor(req, res, 'bob')

        expect(store.ids()).not.toContain('s1')
        expect(req.sessionID).not.toBe('s1')
        expect(invalidated).toEqual([])
        res.emit('finish')
        expect(invalidated).toEqual([{username: 'alice', sessionId: 's1', reason: 'replaced'}])
    })

    test('keeps the session of the same user', async () => {
        const store = sessionStoreHolding({s1: 'alice'})
        const {manager, invalidated} = sessionManagerOver(store)
        const req = requestFor(store, 's1', 'alice')
        const res = aResponse()

        await manager.ensureSessionFor(req, res, 'Alice')

        res.emit('finish')
        expect(store.ids()).toEqual(['s1'])
        expect(req.sessionID).toBe('s1')
        expect(invalidated).toEqual([])
    })

    test('keeps a session nobody is logged in to', async () => {
        const store = sessionStoreHolding({s1: null})
        const {manager, invalidated} = sessionManagerOver(store)
        const req = requestFor(store, 's1', null)
        const res = aResponse()

        await manager.ensureSessionFor(req, res, 'bob')

        res.emit('finish')
        expect(req.sessionID).toBe('s1')
        expect(invalidated).toEqual([])
    })
})

const sessionStoreHolding = usernamesById => {
    const sessions = {...usernamesById}
    return {
        prefix: 'sess:',
        all: callback => callback(null, Object.entries(sessions).map(([id, username]) => ({id, username}))),
        destroy: (id, callback) => {
            delete sessions[id]
            callback(null)
        },
        ids: () => Object.keys(sessions)
    }
}

const sessionManagerOver = store => {
    const event$ = new Subject()
    const invalidated = []
    event$.subscribe(({type, data}) => type === 'loginSessionInvalidated' && invalidated.push(data))
    return {manager: SessionManager(store, {}, event$), invalidated}
}

// express-session's req.session.destroy() removes the session from the store; regenerate() removes it
// and gives the request a fresh, empty one under a new id.
const requestFor = (store, sessionId, username) => {
    const req = {
        sessionID: sessionId,
        get: () => undefined
    }
    const sessionFor = id => ({
        username,
        destroy: callback => store.destroy(id, callback),
        regenerate: callback => store.destroy(id, error => {
            req.sessionID = `${id}-regenerated`
            req.session = sessionFor(req.sessionID)
            req.session.username = undefined
            callback(error)
        })
    })
    req.session = sessionFor(sessionId)
    return req
}

const aResponse = () => {
    const res = new EventEmitter()
    res.status = () => res
    res.send = () => res
    res.cookie = () => res
    return res
}
