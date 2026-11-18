import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

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

const subscriptionUp = (handler, {username = 'alice', roles = [], revision, clientId = 'c1', subscriptionId = 's1'} = {}) =>
    handler({event: 'subscriptionUp', user: {username, roles, revision}, clientId, subscriptionId})

const userUpdated = (handler, {username = 'alice', roles = [], revision}) =>
    handler({event: 'userUpdated', user: {username, roles, revision}})

describe('message ws protocol', () => {
    it('unicasts a notification snapshot on subscriptionUp', async () => {
        const {sent, handler} = setup()
        subscriptionUp(handler)
        await flush()
        assert.deepEqual(sent, [{clientId: 'c1', subscriptionId: 's1', data: {notifications: notificationsFor('alice')}}])
    })

    it('multicasts to all tabs of the user on a user-scoped change', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        messageChanged$.next({username: 'alice'})
        await flush()
        assert.deepEqual(sent, [{username: 'alice', data: {notifications: notificationsFor('alice')}}])
    })

    it('ignores user-scoped changes for users without a subscription', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        messageChanged$.next({username: 'bob'})
        await flush()
        assert.deepEqual(sent, [])
    })

    it('multicasts a user-scoped change to every subscribed admin as well, and to no other user', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler, {username: 'alice', clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {username: 'bob', clientId: 'c2', subscriptionId: 's2'})
        subscriptionUp(handler, {username: 'admin', roles: ['application_admin'], clientId: 'c3', subscriptionId: 's3'})
        await flush()
        sent.length = 0
        messageChanged$.next({username: 'alice'})
        await flush()
        assert.deepEqual(new Set(sent), new Set([
            {username: 'alice', data: {notifications: notificationsFor('alice')}},
            {username: 'admin', data: {notifications: notificationsFor('admin')}}
        ]))
    })

    it('multicasts to every subscribed user on a message-scoped change', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler, {username: 'alice', clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {username: 'bob', clientId: 'c2', subscriptionId: 's2'})
        await flush()
        sent.length = 0
        messageChanged$.next({})
        await flush()
        assert.deepEqual(new Set(sent), new Set([
            {username: 'alice', data: {notifications: notificationsFor('alice')}},
            {username: 'bob', data: {notifications: notificationsFor('bob')}}
        ]))
    })

    it('multicasts once per user on a message-scoped change even with multiple tabs', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler, {username: 'alice', clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {username: 'alice', clientId: 'c2', subscriptionId: 's2'})
        await flush()
        sent.length = 0
        messageChanged$.next({})
        await flush()
        assert.deepEqual(sent, [{username: 'alice', data: {notifications: notificationsFor('alice')}}])
    })

    it('stops forwarding after subscriptionDown', async () => {
        const {sent, messageChanged$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        handler({event: 'subscriptionDown', user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'})
        sent.length = 0
        messageChanged$.next({username: 'alice'})
        await flush()
        assert.deepEqual(sent, [])
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
        assert.deepEqual(sent, [])
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
        assert.deepEqual(sent, [])
    })

    it('unicasts a fresh snapshot on a {refresh: true} data message', async () => {
        const {sent, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        handler({user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1', data: {refresh: true}})
        await flush()
        assert.deepEqual(sent, [{clientId: 'c1', subscriptionId: 's1', data: {notifications: notificationsFor('alice')}}])
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
        assert.deepEqual(new Set(queried), new Set([['admin', true], ['alice', false]]))
        queried.length = 0
        messageChanged$.next({})
        await flush()
        assert.deepEqual(new Set(queried), new Set([['admin', true], ['alice', false]]))
    })

    it('demotion removes drafts from every tab and from later refreshes and changes', async () => {
        const queried = []
        const {sent, messageChanged$, handler} = setup({
            userNotifications: async (username, isAdmin) => {
                queried.push([username, isAdmin])
                return visibleNotifications(username, isAdmin)
            }
        })
        subscriptionUp(handler, {roles: ['application_admin'], revision: 1})
        subscriptionUp(handler, {roles: ['application_admin'], revision: 1, clientId: 'c2', subscriptionId: 's2'})
        subscriptionUp(handler, {username: 'bob', roles: ['application_admin'], clientId: 'c3', subscriptionId: 's3'})
        await flush()
        sent.length = 0
        queried.length = 0

        userUpdated(handler, {roles: [], revision: 2})
        await flush()

        assert.deepEqual(queried, [['alice', false]])
        assert.deepEqual(sent, [{username: 'alice', data: {notifications: visibleNotifications('alice', false)}}])
        sent.length = 0
        queried.length = 0
        handler({
            user: {username: 'alice', roles: ['application_admin']},
            clientId: 'c2', subscriptionId: 's2', data: {refresh: true}
        })
        messageChanged$.next({})
        await flush()

        assert.deepEqual(queried, [['alice', false], ['alice', false], ['bob', true]])
        for (const {username, clientId, data: {notifications}} of sent) {
            assert.deepEqual(notifications, visibleNotifications(username === 'bob' ? 'bob' : 'alice', username === 'bob'))
            assert.ok(username || clientId === 'c2')
        }
        sent.length = 0
        queried.length = 0
        messageChanged$.next({username: 'another-user'})
        await flush()
        assert.deepEqual(queried, [['bob', true]])
        assert.deepEqual(sent, [{username: 'bob', data: {notifications: visibleNotifications('bob', true)}}])
    })

    it('promotion refreshes existing subscriptions with administrator visibility', async () => {
        const {sent, handler} = setup({userNotifications: async (username, isAdmin) => visibleNotifications(username, isAdmin)})
        subscriptionUp(handler, {revision: 1})
        await flush()
        sent.length = 0

        userUpdated(handler, {roles: ['application_admin'], revision: 2})
        await flush()

        assert.deepEqual(sent, [{username: 'alice', data: {notifications: visibleNotifications('alice', true)}}])
    })

    it('delayed subscriptions cannot restore administrator access after demotion', async () => {
        const queried = []
        const {sent, handler, messageChanged$} = setup({
            userNotifications: async (username, isAdmin) => {
                queried.push([username, isAdmin])
                return visibleNotifications(username, isAdmin)
            }
        })
        subscriptionUp(handler, {roles: ['application_admin'], revision: 1})
        userUpdated(handler, {roles: [], revision: 2})
        await flush()
        queried.length = 0
        sent.length = 0

        subscriptionUp(handler, {roles: ['application_admin'], revision: 1})
        subscriptionUp(handler, {roles: ['application_admin'], revision: 1, clientId: 'c2', subscriptionId: 's2'})
        await flush()
        messageChanged$.next({})
        await flush()

        assert.deepEqual(queried, [['alice', false], ['alice', false], ['alice', false]])
        assert.equal(sent.length, 3)
        assert.ok(sent.every(({data: {notifications}}) => notifications.every(({message}) => message.priority !== -1)))
    })

    it('remembers role updates before the first subscription and after all tabs close', async () => {
        const {sent, handler} = setup({userNotifications: async (username, isAdmin) => visibleNotifications(username, isAdmin)})
        handler({event: 'userUpdated', user: {username: 'alice', roles: []}})
        subscriptionUp(handler, {roles: ['application_admin']})
        await flush()
        assert.deepEqual(sent, [{clientId: 'c1', subscriptionId: 's1', data: {notifications: visibleNotifications('alice', false)}}])
        handler({event: 'userDown', user: {username: 'alice'}})
        sent.length = 0

        subscriptionUp(handler, {roles: ['application_admin'], clientId: 'c2', subscriptionId: 's2'})
        await flush()

        assert.deepEqual(sent, [{clientId: 'c2', subscriptionId: 's2', data: {notifications: visibleNotifications('alice', false)}}])
    })

    it('a subscription snapshot without a revision cannot override a known promotion', async () => {
        const {sent, handler} = setup({userNotifications: async (username, isAdmin) => visibleNotifications(username, isAdmin)})
        handler({event: 'userUpdated', user: {username: 'alice', roles: ['application_admin']}})
        subscriptionUp(handler)
        await flush()

        assert.deepEqual(sent, [{clientId: 'c1', subscriptionId: 's1', data: {notifications: visibleNotifications('alice', true)}}])
    })

    it('an administrator update older than a demotion cannot restore drafts', async () => {
        const queried = []
        const {sent, handler, messageChanged$} = setup({
            userNotifications: async (username, isAdmin) => {
                queried.push([username, isAdmin])
                return visibleNotifications(username, isAdmin)
            }
        })
        subscriptionUp(handler, {roles: ['application_admin'], revision: 1})
        userUpdated(handler, {roles: [], revision: 3})
        await flush()
        sent.length = 0
        queried.length = 0

        userUpdated(handler, {roles: ['application_admin'], revision: 2})
        userUpdated(handler, {roles: ['application_admin']})
        await flush()
        messageChanged$.next({})
        await flush()

        assert.deepEqual(queried, [['alice', false]])
        assert.deepEqual(sent, [{username: 'alice', data: {notifications: visibleNotifications('alice', false)}}])
    })

    it('a demotion without a revision revokes drafts, and an earlier administrator snapshot cannot restore them', async () => {
        const queried = []
        const {sent, handler, messageChanged$} = setup({
            userNotifications: async (username, isAdmin) => {
                queried.push([username, isAdmin])
                return visibleNotifications(username, isAdmin)
            }
        })
        subscriptionUp(handler, {roles: ['application_admin'], revision: 1})
        await flush()
        sent.length = 0

        userUpdated(handler, {roles: []})
        await flush()
        assert.deepEqual(sent, [{username: 'alice', data: {notifications: visibleNotifications('alice', false)}}])
        subscriptionUp(handler, {roles: ['application_admin'], revision: 1, clientId: 'c2', subscriptionId: 's2'})
        userUpdated(handler, {roles: ['application_admin']})
        await flush()
        queried.length = 0
        messageChanged$.next({})
        await flush()

        assert.deepEqual(queried, [['alice', false]])
    })

    it('a promotion newer than access revoked without a revision restores drafts', async () => {
        const {sent, handler} = setup({userNotifications: async (username, isAdmin) => visibleNotifications(username, isAdmin)})
        subscriptionUp(handler, {roles: ['application_admin'], revision: 1})
        userUpdated(handler, {roles: []})
        await flush()
        sent.length = 0

        userUpdated(handler, {roles: ['application_admin'], revision: 2})
        await flush()

        assert.deepEqual(sent, [{username: 'alice', data: {notifications: visibleNotifications('alice', true)}}])
    })

    it('a newer subscription snapshot promotes every tab of the user', async () => {
        const {sent, handler} = setup({userNotifications: async (username, isAdmin) => visibleNotifications(username, isAdmin)})
        subscriptionUp(handler, {revision: 1})
        await flush()
        sent.length = 0

        subscriptionUp(handler, {roles: ['application_admin'], revision: 2, clientId: 'c2', subscriptionId: 's2'})
        await flush()

        assert.deepEqual(new Set(sent.map(JSON.stringify)), new Set([
            {username: 'alice', data: {notifications: visibleNotifications('alice', true)}},
            {clientId: 'c2', subscriptionId: 's2', data: {notifications: visibleNotifications('alice', true)}}
        ].map(JSON.stringify)))
    })

    for (const trigger of ['subscriptionUp', 'refresh', 'change']) {
        it(`discards a pending administrator ${trigger} response after demotion`, async () => {
            const pending = Promise.withResolvers()
            let holdAdminResult = trigger === 'subscriptionUp'
            const {sent, handler, messageChanged$} = setup({
                userNotifications: (username, isAdmin) => holdAdminResult && isAdmin
                    ? pending.promise
                    : Promise.resolve(visibleNotifications(username, isAdmin))
            })
            subscriptionUp(handler, {roles: ['application_admin'], revision: 1})
            if (trigger !== 'subscriptionUp') {
                subscriptionUp(handler, {roles: ['application_admin'], revision: 1, clientId: 'c2', subscriptionId: 's2'})
                await flush()
                sent.length = 0
                holdAdminResult = true
                if (trigger === 'refresh') {
                    handler({user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1', data: {refresh: true}})
                } else {
                    messageChanged$.next({})
                }
            }

            userUpdated(handler, {roles: [], revision: 2})
            await flush()
            assert.deepEqual(sent, [{username: 'alice', data: {notifications: visibleNotifications('alice', false)}}])
            sent.length = 0
            pending.resolve(visibleNotifications('alice', true))
            await flush()

            assert.deepEqual(sent, [])
        })
    }

    it('delivers a pending shared update if one tab closes but another remains', async () => {
        const pending = Promise.withResolvers()
        let hold = false
        const {sent, handler, messageChanged$} = setup({
            userNotifications: username => hold ? pending.promise : Promise.resolve(notificationsFor(username))
        })
        subscriptionUp(handler)
        subscriptionUp(handler, {clientId: 'c2', subscriptionId: 's2'})
        await flush()
        sent.length = 0
        hold = true
        messageChanged$.next({})
        handler({event: 'subscriptionDown', user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'})
        pending.resolve(notificationsFor('alice'))
        await flush()

        assert.deepEqual(sent, [{username: 'alice', data: {notifications: notificationsFor('alice')}}])
    })

    it('a demoting subscription snapshot from another tab invalidates a pending administrator update', async () => {
        const pending = Promise.withResolvers()
        let hold = false
        const {sent, handler, messageChanged$} = setup({
            userNotifications: (username, isAdmin) => hold && isAdmin
                ? pending.promise
                : Promise.resolve(visibleNotifications(username, isAdmin))
        })
        subscriptionUp(handler, {roles: ['application_admin'], revision: 1})
        await flush()
        sent.length = 0
        hold = true
        messageChanged$.next({})
        subscriptionUp(handler, {revision: 2, clientId: 'c2', subscriptionId: 's2'})
        await flush()
        sent.length = 0

        pending.resolve(visibleNotifications('alice', true))
        await flush()

        assert.deepEqual(sent, [])
    })

    it('ignores user updates that do not change subscription permissions', async () => {
        const pending = Promise.withResolvers()
        let queries = 0
        const {sent, handler} = setup({
            userNotifications: () => {
                queries++
                return pending.promise
            }
        })
        subscriptionUp(handler, {roles: ['application_admin']})

        handler({event: 'userUpdated', user: {username: 'alice', roles: ['application_admin'], name: 'New name'}})
        handler({event: 'userUpdated', user: {username: 'unsubscribed-user', roles: []}})
        pending.resolve(visibleNotifications('alice', true))
        await flush()

        assert.equal(queries, 1)
        assert.deepEqual(sent, [{clientId: 'c1', subscriptionId: 's1', data: {notifications: visibleNotifications('alice', true)}}])
    })

    it('cannot refresh through another user or client subscription', async () => {
        let queries = 0
        const {sent, handler} = setup({
            userNotifications: async (username, isAdmin) => {
                queries++
                return visibleNotifications(username, isAdmin)
            }
        })
        subscriptionUp(handler, {username: 'admin', roles: ['application_admin']})
        await flush()
        sent.length = 0

        handler({user: {username: 'alice'}, clientId: 'c2', subscriptionId: 's1', data: {refresh: true}})
        handler({user: {username: 'admin'}, clientId: 'c2', subscriptionId: 's1', data: {refresh: true}})
        handler({user: {username: 'alice'}, clientId: 'c2', subscriptionId: 'missing', data: {refresh: true}})
        await flush()

        assert.equal(queries, 1)
        assert.deepEqual(sent, [])
    })

    for (const event of ['subscriptionDown', 'clientDown', 'userDown', 'stop']) {
        it(`discards a pending snapshot after ${event}`, async () => {
            const pending = Promise.withResolvers()
            const {sent, handler, stop$} = setup({userNotifications: () => pending.promise})
            subscriptionUp(handler, {roles: ['application_admin']})

            if (event === 'stop') {
                stop$.next()
            } else {
                handler({event, user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'})
            }
            pending.resolve(visibleNotifications('alice', true))
            await flush()

            assert.deepEqual(sent, [])
        })
    }

    it('swallows snapshot failures without sending or crashing', async () => {
        const {sent, handler} = setup({
            userNotifications: async () => {
                throw new Error('db down')
            }
        })
        subscriptionUp(handler)
        await flush()
        assert.deepEqual(sent, [])
    })

    it('unsubscribes from messageChanged$ on stop$', async () => {
        const {sent, messageChanged$, stop$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        stop$.next()
        messageChanged$.next({username: 'alice'})
        await flush()
        assert.deepEqual(sent, [])
    })
})

const visibleNotifications = (username, isAdmin) => [
    ...notificationsFor(username).map(notification => isAdmin ? {...notification, acknowledged: 3} : notification),
    ...(isAdmin ? [{message: {id: 'draft', priority: -1, contents: 'Private draft'}, username, state: 'READ'}] : [])
]
