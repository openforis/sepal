import {Subject} from 'rxjs'

import {createUserWsProtocol} from './ws.js'

describe('user ws protocol', () => {
    test('relays every UserUpdated to the gateway as an event', () => {
        const {sent, userUpdated$} = connect()
        const eventUser = {username: 'bob', status: 'ACTIVE'}

        userUpdated$.next(eventUser)

        expect(sent).toEqual([{event: 'userUpdated', user: eventUser}])
    })

    test('unicasts a changed user to each admin subscription', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin(), clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {user: anAdmin(), clientId: 'c2', subscriptionId: 's2'})
        const bob = aUser({username: 'bob', status: 'LOCKED'})

        userChanged$.next(bob)

        expect(sent).toEqual([
            {clientId: 'c1', subscriptionId: 's1', data: {user: expect.objectContaining({username: 'bob', status: 'LOCKED'})}},
            {clientId: 'c2', subscriptionId: 's2', data: {user: expect.objectContaining({username: 'bob', status: 'LOCKED'})}}
        ])
    })

    test('pushes the public user shape without Google tokens', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin()})

        userChanged$.next(aUser({googleTokens: {accessToken: 'a', refreshToken: 'r'}, passwordHash: 'h', token: 't'}))

        const [{data: {user}}] = sent
        expect(user).toMatchObject({googleUser: true, googleTokens: null, admin: false})
        expect(user).not.toHaveProperty('passwordHash')
        expect(user).not.toHaveProperty('token')
    })

    test('ignores a subscription from a non-admin', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: aUser()})

        userChanged$.next(aUser())

        expect(sent).toEqual([])
    })

    test('stops pushing after subscriptionDown', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin(), clientId: 'c1', subscriptionId: 's1'})

        handler({event: 'subscriptionDown', clientId: 'c1', subscriptionId: 's1'})
        userChanged$.next(aUser())

        expect(sent).toEqual([])
    })

    test('drops every subscription of a client that went down', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin(), clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {user: anAdmin(), clientId: 'c1', subscriptionId: 's2'})

        handler({event: 'clientDown', clientId: 'c1'})
        userChanged$.next(aUser())

        expect(sent).toEqual([])
    })

    test('drops every subscription of a user that went down', () => {
        const {sent, handler, userChanged$} = connect()
        subscriptionUp(handler, {user: anAdmin({username: 'admin'}), clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {user: anAdmin({username: 'admin'}), clientId: 'c2', subscriptionId: 's2'})

        handler({event: 'userDown', user: {username: 'admin'}})
        userChanged$.next(aUser())

        expect(sent).toEqual([])
    })

    test('stops pushing once the connection is torn down', () => {
        const {sent, handler, userChanged$, stop$} = connect()
        subscriptionUp(handler, {user: anAdmin()})

        stop$.next()
        userChanged$.next(aUser())

        expect(sent).toEqual([])
    })
})

const connect = () => {
    const sent = []
    const userUpdated$ = new Subject()
    const userChanged$ = new Subject()
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
    googleTokens: null,
    ...overrides
})

const anAdmin = ({username = 'admin'} = {}) => aUser({username, admin: true})
