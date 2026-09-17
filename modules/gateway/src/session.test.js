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
        expect(invalidated).toEqual([{username: 'alice', sessionId: 's1'}])
    })
})

describe('invalidateOtherSessions', () => {
    test('announces every other session of the user, not the caller\'s', async () => {
        const store = sessionStoreHolding({s1: 'alice', s2: 'alice', s3: 'bob'})
        const {manager, invalidated} = sessionManagerOver(store)

        await manager.invalidateOtherSessions(requestFor(store, 's1', 'alice'), aResponse())

        expect(store.ids()).toEqual(['s1', 's3'])
        expect(invalidated).toEqual([{username: 'alice', sessionId: 's2'}])
    })
})

describe('user.UserLocked', () => {
    test('announces every session of the locked user', async () => {
        const store = sessionStoreHolding({s1: 'alice', s2: 'alice', s3: 'bob'})
        const {manager, invalidated} = sessionManagerOver(store)

        await manager.messageHandler('user.UserLocked', {username: 'alice'})

        expect(store.ids()).toEqual(['s3'])
        expect(invalidated).toEqual([
            {username: 'alice', sessionId: 's1'},
            {username: 'alice', sessionId: 's2'}
        ])
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

// express-session's req.session.destroy() removes the session from the store.
const requestFor = (store, sessionId, username) => ({
    sessionID: sessionId,
    session: {
        username,
        destroy: callback => store.destroy(sessionId, callback)
    },
    get: () => undefined
})

const aResponse = () => {
    const res = {status: () => res, send: () => res, cookie: () => res}
    return res
}
