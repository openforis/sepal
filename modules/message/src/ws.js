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
        // Later subscriptions can carry an older gateway-cache snapshot than a role update.
        const latestAdminRoleByUsername = new Map()

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
                const hasCurrentRecipient = subscriptions.some(subscription =>
                    subscription.isAdmin === isAdmin && isSubscriptionUnchanged(subscription)
                )
                if (hasCurrentRecipient) {
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
            const isAdmin = latestAdminRoleByUsername.get(username) ?? userIsAdmin(user)
            log.debug(() => `Subscription up: ${username} (${subscriptionId})`)
            const subscription = {username, isAdmin, clientId, subscriptionId}
            subscriptionsById.set(subscriptionId, subscription)
            sendToSubscription(subscription)
        }

        const onUserUpdated = ({user}) => {
            const {username} = user
            const isAdmin = userIsAdmin(user)
            latestAdminRoleByUsername.set(username, isAdmin)
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
            latestAdminRoleByUsername.clear()
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

const createMessageWs = ({userNotifications, messageChanged$}) =>
    moduleWs$(createMessageWsProtocol({userNotifications, messageChanged$}))

export {createMessageWs, createMessageWsProtocol}
