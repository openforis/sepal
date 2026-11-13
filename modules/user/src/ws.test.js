import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {Subject} from 'rxjs'

import {publishUserUpdated, userChanged$ as publishedUserChanged$, userUpdated$ as publishedUserUpdated$} from './events.js'
import {createUserWsProtocol} from './ws.js'

describe('user ws protocol', () => {
    test('relays every UserUpdated to the gateway as an event', () => {
        const {sent, userUpdated$} = connect()
        const eventUser = {username: 'bob', status: 'ACTIVE'}

        userUpdated$.next(eventUser)

        assert.deepEqual(sent, [{event: 'userUpdated', user: eventUser}])
    })

    test('unicasts a changed user to each admin subscription', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin(), clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {user: anAdmin(), clientId: 'c2', subscriptionId: 's2'})
        const bob = aUser({username: 'bob', status: 'LOCKED'})

        userChanged$.next(bob)

        assert.equal(sent.length, 2)
        assert.partialDeepStrictEqual(sent, [
            {clientId: 'c1', subscriptionId: 's1', data: {user: {username: 'bob', status: 'LOCKED'}}},
            {clientId: 'c2', subscriptionId: 's2', data: {user: {username: 'bob', status: 'LOCKED'}}}
        ])
    })

    test('pushes the public user shape without Google tokens', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin()})

        userChanged$.next(aUser({googleTokens: {accessToken: 'a', refreshToken: 'r'}, passwordHash: 'h', token: 't'}))

        const [{data: {user}}] = sent
        assert.partialDeepStrictEqual(user, {googleUser: true, googleTokens: null, admin: false})
        assert.ok(!('passwordHash' in Object(user)))
        assert.ok(!('token' in Object(user)))
    })

    test('ignores a subscription from a non-admin', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: aUser()})

        userChanged$.next(aUser())

        assert.deepEqual(sent, [])
    })

    test('demotion removes every affected tab before forwarding further profile changes', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin({username: 'alice'}), clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {user: anAdmin({username: 'alice'}), clientId: 'c2', subscriptionId: 's2'})
        subscriptionUp(handler, {user: anAdmin({username: 'carol'}), clientId: 'c3', subscriptionId: 's3'})

        userChanged$.next(aUser({username: 'alice', revision: 2}))
        userChanged$.next(aUser({username: 'bob'}))

        assert.deepEqual(sent.map(({clientId, subscriptionId}) => ({clientId, subscriptionId})), [
            {clientId: 'c3', subscriptionId: 's3'},
            {clientId: 'c3', subscriptionId: 's3'}
        ])
    })

    test('a known demotion rejects stale subscriptions before the first tab and after all tabs close', () => {
        const {sent, handler, userChanged$} = connect()
        userChanged$.next(aUser({username: 'alice', revision: 2}))

        subscriptionUp(handler, {user: anAdmin({username: 'alice'})})
        handler({event: 'userDown', user: {username: 'alice'}})
        handler({event: 'userUpdated', user: anAdmin({username: 'alice'})})
        subscriptionUp(handler, {user: anAdmin({username: 'alice'}), clientId: 'c2', subscriptionId: 's2'})
        userChanged$.next(aUser())

        assert.deepEqual(sent, [])
    })

    test('an older local update cannot undo a newer demotion', () => {
        const {sent, handler, userChanged$} = connect()
        userChanged$.next(aUser({username: 'alice', revision: 2}))
        userChanged$.next(anAdmin({username: 'alice'}))

        subscriptionUp(handler, {user: anAdmin({username: 'alice'})})
        userChanged$.next(aUser())

        assert.deepEqual(sent, [])
    })

    test('a newer non-admin subscription snapshot also revokes older tabs', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin({username: 'alice'})})

        subscriptionUp(handler, {user: aUser({username: 'alice', revision: 2}), clientId: 'c2', subscriptionId: 's2'})
        userChanged$.next(aUser())

        assert.deepEqual(sent, [])
    })

    test('a newer administrator subscription snapshot takes precedence over an older local demotion', () => {
        const {sent, handler, userChanged$} = connect()
        const demoted = aUser({username: 'alice', revision: 2})
        userChanged$.next(demoted)

        subscriptionUp(handler, {user: {...anAdmin({username: 'alice'}), revision: 3}})
        userChanged$.next(demoted)
        userChanged$.next(aUser())

        assert.equal(sent.length, 2)
        assert.ok(sent.every(({clientId, subscriptionId}) => clientId === 'c1' && subscriptionId === 's1'))
    })

    test('an unversioned administrator snapshot cannot override a known demotion', () => {
        const {sent, handler, userChanged$} = connect()
        userChanged$.next(aUser({username: 'alice', revision: 2}))
        const {revision: _revision, ...unversioned} = anAdmin({username: 'alice'})

        subscriptionUp(handler, {user: unversioned})
        userChanged$.next(aUser())

        assert.deepEqual(sent, [])
    })

    test('a new promotion permits a fresh subscription carrying an older non-admin snapshot', () => {
        const {sent, handler, userChanged$} = connect()
        userChanged$.next(aUser({username: 'alice', revision: 2}))
        subscriptionUp(handler, {user: anAdmin({username: 'alice'})})
        userChanged$.next({...anAdmin({username: 'alice'}), revision: 3})
        assert.deepEqual(sent, [])

        subscriptionUp(handler, {user: aUser({username: 'alice'}), clientId: 'c2', subscriptionId: 's2'})
        userChanged$.next(aUser())

        assert.equal(sent.length, 1)
        assert.partialDeepStrictEqual(sent[0], {clientId: 'c2', subscriptionId: 's2', data: {user: {username: 'bob'}}})
    })

    test('same-role profile changes keep a current administrator subscribed', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin()})

        userChanged$.next({...anAdmin(), revision: 2, name: 'Updated admin'})

        assert.equal(sent.length, 1)
        assert.partialDeepStrictEqual(sent[0], {data: {user: {name: 'Updated admin'}}})
    })

    test('actual user publications revoke before broadcasting the changed profile', t => {
        const {sent, handler, stop$} = connect({userUpdated$: publishedUserUpdated$, userChanged$: publishedUserChanged$})
        t.after(() => stop$.next())
        subscriptionUp(handler, {user: anAdmin({username: 'alice'}), clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {user: anAdmin({username: 'carol'}), clientId: 'c2', subscriptionId: 's2'})
        const demoted = aUser({username: 'alice', revision: 2})

        publishUserUpdated(demoted)

        assert.equal(sent.length, 2)
        assert.equal(sent[0].event, 'userUpdated')
        assert.deepEqual(sent.slice(1).map(({clientId}) => clientId), ['c2'])
    })

    test('stops pushing after subscriptionDown', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin(), clientId: 'c1', subscriptionId: 's1'})

        handler({event: 'subscriptionDown', clientId: 'c1', subscriptionId: 's1'})
        userChanged$.next(aUser())

        assert.deepEqual(sent, [])
    })

    test('drops every subscription of a client that went down', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin(), clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {user: anAdmin(), clientId: 'c1', subscriptionId: 's2'})

        handler({event: 'clientDown', clientId: 'c1'})
        userChanged$.next(aUser())

        assert.deepEqual(sent, [])
    })

    test('drops every subscription of a user that went down', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin({username: 'admin'}), clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {user: anAdmin({username: 'admin'}), clientId: 'c2', subscriptionId: 's2'})

        handler({event: 'userDown', user: {username: 'admin'}})
        userChanged$.next(aUser())

        assert.deepEqual(sent, [])
    })

    test('stops pushing once the connection is torn down', () => {
        const {sent, handler, userChanged$, stop$} = connect()
        subscriptionUp(handler, {user: anAdmin()})

        stop$.next()
        userChanged$.next(aUser())

        assert.deepEqual(sent, [])
    })
})

const connect = ({userUpdated$ = new Subject(), userChanged$ = new Subject()} = {}) => {
    const sent = []
    const stop$ = new Subject()
    const handler = createUserWsProtocol({userUpdated$, userChanged$})({send: message => sent.push(message), stop$})
    return {sent, handler, userUpdated$, userChanged$, stop$}
}

const subscriptionUp = (handler, {user, clientId = 'c1', subscriptionId = 's1'}) =>
    handler({event: 'subscriptionUp', user, clientId, subscriptionId})

const aUser = ({username = 'bob', admin = false, ...overrides} = {}) => ({
    id: 1,
    username,
    name: 'Bob',
    email: `${username}@example.org`,
    status: 'ACTIVE',
    admin,
    roles: admin ? ['application_admin'] : [],
    revision: 1,
    googleTokens: null,
    ...overrides
})

const anAdmin = ({username = 'admin'} = {}) => aUser({username, admin: true})
