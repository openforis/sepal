// One gateway connection serves every user's notification subscriptions.
// Each push contains the full REST-shaped list, so re-subscribing restores the client's state.

import {takeUntil} from 'rxjs'

import {getLogger} from '#sepal/log'
import {moduleWs$} from '#sepal/ws/module'

import {isAdmin as userIsAdmin} from './currentUser.js'

const log = getLogger('ws')

const createMessageWsProtocol = ({userNotifications, messageChanged$}) =>
    ({send, stop$}) => {
        const subscriptionsById = new Map()
        // Role updates and subscription snapshots can arrive older than one already seen (see nextRole).
        const knownRoleByUsername = new Map()

        const subscribedUsers = () => {
            const usersByUsername = new Map()
            for (const subscription of subscriptionsById.values()) {
                const {username, isAdmin} = subscription
                if (!usersByUsername.has(username)) {
                    usersByUsername.set(username, {username, isAdmin, subscriptions: []})
                }
                usersByUsername.get(username).subscriptions.push(subscription)
            }
            return usersByUsername.values()
        }

        // Role changes replace records, so this checks both subscription lifetime and permissions.
        const isSubscriptionUnchanged = subscription => subscriptionsById.get(subscription.subscriptionId) === subscription

        const sendToSubscription = async subscription => {
            const {username, isAdmin, clientId, subscriptionId} = subscription
            try {
                const notifications = await userNotifications(username, isAdmin)
                if (isSubscriptionUnchanged(subscription)) {
                    send({clientId, subscriptionId, data: {notifications}})
                }
            } catch (error) {
                log.error(`Failed to send notification snapshot for ${username}`, error)
            }
        }

        const sendToUser = async ({username, isAdmin, subscriptions}) => {
            try {
                const notifications = await userNotifications(username, isAdmin)
                if (subscriptions.some(isSubscriptionUnchanged)) {
                    send({username, data: {notifications}})
                }
            } catch (error) {
                log.error(`Failed to send notification update for ${username}`, error)
            }
        }

        const onNotificationsChanged = ({username: changedUsername}) => {
            for (const subscribedUser of subscribedUsers()) {
                const {username, isAdmin} = subscribedUser
                if (!changedUsername || username === changedUsername || isAdmin) {
                    sendToUser(subscribedUser)
                }
            }
        }

        const onSubscriptionUp = ({user, clientId, subscriptionId}) => {
            const {username} = user
            const {isAdmin} = observeRole(user)
            log.debug(() => `Subscription up: ${username} (${subscriptionId})`)
            const subscription = {username, isAdmin, clientId, subscriptionId}
            subscriptionsById.set(subscriptionId, subscription)
            sendToSubscription(subscription)
        }

        const onUserUpdated = ({user}) => {
            observeRole(user, {revokesWithoutRevision: true})
        }

        const observeRole = (user, {revokesWithoutRevision = false} = {}) => {
            const {username} = user
            const known = knownRoleByUsername.get(username)
            const role = nextRole(known, user, revokesWithoutRevision)
            if (role !== known) {
                knownRoleByUsername.set(username, role)
                applyRole(username, role.isAdmin)
            }
            return role
        }

        const applyRole = (username, isAdmin) => {
            const changedSubscriptions = []
            for (const [subscriptionId, subscription] of subscriptionsById) {
                if (subscription.username === username && subscription.isAdmin !== isAdmin) {
                    // Replacing the record invalidates responses fetched with the previous permissions.
                    const updatedSubscription = {...subscription, isAdmin}
                    subscriptionsById.set(subscriptionId, updatedSubscription)
                    changedSubscriptions.push(updatedSubscription)
                }
            }
            if (changedSubscriptions.length) {
                sendToUser({username, isAdmin, subscriptions: changedSubscriptions})
            }
        }

        const onSubscriptionDown = ({subscriptionId}) => {
            subscriptionsById.delete(subscriptionId)
        }

        const onClientDown = ({clientId}) => {
            for (const [subscriptionId, subscription] of subscriptionsById) {
                if (subscription.clientId === clientId) {
                    subscriptionsById.delete(subscriptionId)
                }
            }
        }

        const onUserDown = ({user: {username}}) => {
            for (const [subscriptionId, subscription] of subscriptionsById) {
                if (subscription.username === username) {
                    subscriptionsById.delete(subscriptionId)
                }
            }
        }

        const onRefresh = ({user, clientId, subscriptionId}) => {
            const subscription = subscriptionsById.get(subscriptionId)
            if (subscription?.username === user.username && subscription.clientId === clientId) {
                sendToSubscription(subscription)
            }
        }

        const EVENT_HANDLERS = {
            subscriptionUp: onSubscriptionUp,
            subscriptionDown: onSubscriptionDown,
            clientDown: onClientDown,
            userDown: onUserDown,
            userUpdated: onUserUpdated,
        }

        stop$.subscribe(() => {
            subscriptionsById.clear()
            knownRoleByUsername.clear()
        })

        messageChanged$
            .pipe(takeUntil(stop$))
            .subscribe({
                next: onNotificationsChanged,
                error: error => log.error('Unexpected messageChanged$ stream error', error),
            })

        return message => {
            const {event, data} = message
            if (event) {
                const handler = EVENT_HANDLERS[event]
                if (handler) {
                    handler(message)
                } else {
                    log.trace(() => `Ignoring event: ${event}`)
                }
            } else if (data?.refresh) {
                onRefresh(message)
            } else if (data) {
                log.warn('Unsupported message data:', data)
            } else {
                log.warn('Unsupported message:', message)
            }
        }
    }

// Newer by revision wins. Without a revision nothing can be ordered: such a role update can still revoke, since a
// missed revocation would keep drafts visible indefinitely, but never grant, and the known revision stays, so only a
// newer one grants again. A subscription snapshot without a revision only fills in a role not yet known.
const nextRole = (known, user, revokesWithoutRevision) => {
    const isAdmin = userIsAdmin(user)
    if (!known) {
        return {isAdmin, revision: user.revision ?? -1}
    }
    if (user.revision == null) {
        return revokesWithoutRevision && known.isAdmin && !isAdmin ? {isAdmin, revision: known.revision} : known
    }
    return user.revision > known.revision ? {isAdmin, revision: user.revision} : known
}

const createMessageWs = ({userNotifications, messageChanged$}) =>
    moduleWs$(createMessageWsProtocol({userNotifications, messageChanged$}))

export {createMessageWs, createMessageWsProtocol}
