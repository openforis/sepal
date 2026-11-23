import {takeUntil} from 'rxjs'

import {getLogger} from '#sepal/log'
import {moduleWs$} from '#sepal/ws/module'

import {userChanged$ as defaultUserChanged$, userUpdated$ as defaultUserUpdated$} from './events.js'
import {userToMap} from './user.js'

const log = getLogger('ws')

// The gateway opens one connection to /ws. For its lifetime, relay every UserUpdated as
// {event:'userUpdated', user}; the gateway broadcasts it to modules and nudges the user's browser
// clients to refresh. Browser subscriptions come from admins watching the user list: each user
// change is unicast to them in the /list row shape. Subscriptions from non-admins are ignored,
// as /list itself is admin-only.
const createUserWsProtocol = ({userUpdated$, userChanged$}) =>
    ({send, stop$}) => {
        // subscriptionId → {username, clientId}
        const subscriptions = new Map()
        const latestAdminRoleByUsername = new Map()

        const removeSubscriptions = predicate => {
            for (const [subscriptionId, subscription] of subscriptions) {
                if (predicate(subscription)) {
                    subscriptions.delete(subscriptionId)
                }
            }
        }

        const updateAdminRole = user => {
            const previous = latestAdminRoleByUsername.get(user.username)
            const current = {admin: user.admin, revision: user.revision ?? -1}
            if (previous && previous.revision >= current.revision) {
                return previous
            }
            // Cached subscriptions and delayed local updates can carry an older role.
            latestAdminRoleByUsername.set(user.username, current)
            if (!current.admin) {
                removeSubscriptions(subscription => subscription.username === user.username)
            }
            return current
        }

        const onSubscriptionUp = ({user, clientId, subscriptionId}) => {
            const {username} = user
            const {admin} = updateAdminRole(user)
            if (admin) {
                subscriptions.set(subscriptionId, {username, clientId})
            } else {
                log.warn(`Ignoring user list subscription from non-admin ${username}`)
            }
        }

        const onSubscriptionDown = ({subscriptionId}) =>
            subscriptions.delete(subscriptionId)

        const onClientDown = ({clientId}) =>
            removeSubscriptions(subscription => subscription.clientId === clientId)

        const onUserDown = ({user: {username}}) =>
            removeSubscriptions(subscription => subscription.username === username)

        const onUserChanged = user => {
            updateAdminRole(user)
            const data = {user: userToMap(user, false)}
            for (const [subscriptionId, {clientId}] of subscriptions) {
                send({clientId, subscriptionId, data})
            }
        }

        const EVENT_HANDLERS = {
            subscriptionUp: onSubscriptionUp,
            subscriptionDown: onSubscriptionDown,
            clientDown: onClientDown,
            userDown: onUserDown
        }

        stop$.subscribe(() => {
            subscriptions.clear()
            latestAdminRoleByUsername.clear()
        })

        userUpdated$.pipe(takeUntil(stop$)).subscribe({
            next: user => send({event: 'userUpdated', user}),
            error: error => log.warn('userUpdated stream error', error)
        })

        userChanged$.pipe(takeUntil(stop$)).subscribe({
            next: user => onUserChanged(user),
            error: error => log.warn('userChanged stream error', error)
        })

        // Gateway events this module has no interest in (clientUp, userUp, ...) pass silently.
        return message => {
            const {event, user, clientId, subscriptionId} = message
            if (event) {
                const handler = EVENT_HANDLERS[event]
                handler && handler({user, clientId, subscriptionId})
            } else {
                log.warn('Unsupported message:', message)
            }
        }
    }

const ws$ = moduleWs$(createUserWsProtocol({userUpdated$: defaultUserUpdated$, userChanged$: defaultUserChanged$}))

export {createUserWsProtocol}

export default ctx => ws$(ctx.arg$)
