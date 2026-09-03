import {Subject} from 'rxjs'

import {createMessageWsProtocol} from './ws.js'

// flush pending promise chains (the snapshot/update paths are async fire-and-forget)
const flush = () => new Promise(resolve => setImmediate(resolve))

const notificationsFor = username => [{
    message: {id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM'},
    username,
    state: 'UNREAD'
}]

const setup = ({userNotifications} = {}) => {
    const sent = []
    const messageChanged$ = new Subject()
    const stop$ = new Subject()
    const protocol = createMessageWsProtocol({
        userNotifications: userNotifications ?? (async username => notificationsFor(username)),
        messageChanged$
    })
    const handler = protocol({send: message => sent.push(message), stop$})
    return {sent, messageChanged$, stop$, handler}
}

const subscriptionUp = (handler, {username = 'alice', roles = [], clientId = 'c1', subscriptionId = 's1'} = {}) =>
    handler({event: 'subscriptionUp', user: {username, roles}, clientId, subscriptionId})

describe('message ws protocol', () => {
    it('unicasts a notification snapshot on subscriptionUp', async () => {
        const {sent, handler} = setup()
        subscriptionUp(handler)
        await flush()
        expect(sent).toEqual([{clientId: 'c1', subscriptionId: 's1', data: {notifications: notificationsFor('alice')}}])
    })

    it('multicasts to all tabs of the user on a user-scoped change', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        messageChanged$.next({username: 'alice'})
        await flush()
        expect(sent).toEqual([{username: 'alice', data: {notifications: notificationsFor('alice')}}])
    })

    it('ignores user-scoped changes for users without a subscription', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        messageChanged$.next({username: 'bob'})
        await flush()
        expect(sent).toEqual([])
    })

    it('multicasts to every subscribed user on a message-scoped change', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler, {username: 'alice', clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {username: 'bob', clientId: 'c2', subscriptionId: 's2'})
        await flush()
        sent.length = 0
        messageChanged$.next({})
        await flush()
        expect(sent).toEqual(expect.arrayContaining([
            {username: 'alice', data: {notifications: notificationsFor('alice')}},
            {username: 'bob', data: {notifications: notificationsFor('bob')}}
        ]))
        expect(sent.length).toBe(2)
    })

    it('multicasts once per user on a message-scoped change even with multiple tabs', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler, {username: 'alice', clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {username: 'alice', clientId: 'c2', subscriptionId: 's2'})
        await flush()
        sent.length = 0
        messageChanged$.next({})
        await flush()
        expect(sent).toEqual([{username: 'alice', data: {notifications: notificationsFor('alice')}}])
    })

    it('stops forwarding after subscriptionDown', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        handler({event: 'subscriptionDown', user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'})
        sent.length = 0
        messageChanged$.next({username: 'alice'})
        await flush()
        expect(sent).toEqual([])
    })

    it('drops all of a client\'s subscriptions on clientDown', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler, {clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {clientId: 'c1', subscriptionId: 's2'})
        await flush()
        handler({event: 'clientDown', user: {username: 'alice'}, clientId: 'c1'})
        sent.length = 0
        messageChanged$.next({username: 'alice'})
        await flush()
        expect(sent).toEqual([])
    })

    it('drops all of a user\'s subscriptions on userDown', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler, {clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {clientId: 'c2', subscriptionId: 's2'})
        await flush()
        handler({event: 'userDown', user: {username: 'alice'}})
        sent.length = 0
        messageChanged$.next({username: 'alice'})
        await flush()
        expect(sent).toEqual([])
    })

    it('unicasts a fresh snapshot on a {refresh: true} data message', async () => {
        const {sent, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        handler({user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1', data: {refresh: true}})
        await flush()
        expect(sent).toEqual([{clientId: 'c1', subscriptionId: 's1', data: {notifications: notificationsFor('alice')}}])
    })

    it('queries notifications with the admin flag of the subscribed user', async () => {
        const queried = []
        const {messageChanged$, handler} = setup({
            userNotifications: async (username, isAdmin) => {
                queried.push([username, isAdmin])
                return notificationsFor(username)
            }
        })
        subscriptionUp(handler, {username: 'admin', roles: ['application_admin'], clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {username: 'alice', clientId: 'c2', subscriptionId: 's2'})
        await flush()
        expect(queried).toEqual(expect.arrayContaining([['admin', true], ['alice', false]]))
        queried.length = 0
        messageChanged$.next({})
        await flush()
        expect(queried).toEqual(expect.arrayContaining([['admin', true], ['alice', false]]))
        expect(queried.length).toBe(2)
    })

    it('swallows snapshot failures without sending or crashing', async () => {
        const {sent, handler} = setup({
            userNotifications: async () => {
                throw new Error('db down')
            }
        })
        subscriptionUp(handler)
        await flush()
        expect(sent).toEqual([])
    })

    it('unsubscribes from messageChanged$ on stop$', async () => {
        const {sent, messageChanged$, stop$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        stop$.next()
        messageChanged$.next({username: 'alice'})
        await flush()
        expect(sent).toEqual([])
    })
})
