// The message module's gateway-websocket endpoint (module `message` in the gateway's
// webSocketEndpoints; see modules/gateway/src/websocket.js for the MODULE PROTOCOL).
//
// Payload is {notifications}, mapped with the SAME notificationToMap the REST endpoint uses, so
// the GUI stores it without translation. Sending the FULL list on every push (rather than deltas)
// is what makes reconnect self-healing: the GUI re-subscribes and gets a fresh snapshot.
//
// One gateway connection carries every user's subscriptions, so the registry is per-connection
// state inside the protocol closure (moduleWs$ invokes protocol once per connection).

import {takeUntil} from 'rxjs'

import {getLogger} from '#sepal/log'
import {moduleWs$} from '#sepal/ws/module'

import {isAdmin as userIsAdmin} from './currentUser.js'

const log = getLogger('ws')

const createMessageWsProtocol = ({userNotifications, messageChanged$}) =>
    ({send, stop$}) => {
        // subscriptionId → {username, isAdmin, clientId}
        const subscriptions = new Map()

        // username → isAdmin (only admins get unpublished messages in their snapshots)
        const subscribedUsers = () => {
            const users = new Map()
            for (const {username, isAdmin} of subscriptions.values()) {
                users.set(username, isAdmin)
            }
            return users
        }

        // Unicast to one subscriber (subscriptionUp / refresh).
        const sendSnapshot = async ({username, isAdmin, clientId, subscriptionId}) => {
            try {
                send({clientId, subscriptionId, data: {notifications: await userNotifications(username, isAdmin)}})
            } catch (error) {
                log.error(`Failed to send notification snapshot for ${username}`, error)
            }
        }

        // Multicast to all of the user's tabs (a change the user did not necessarily trigger).
        const sendUpdate = async (username, isAdmin) => {
            try {
                send({username, data: {notifications: await userNotifications(username, isAdmin)}})
            } catch (error) {
                log.error(`Failed to send notification update for ${username}`, error)
            }
        }

        const onChanged = ({username}) => {
            const users = subscribedUsers()
            if (username) {
                if (users.has(username)) {
                    sendUpdate(username, users.get(username))
                }
            } else {
                users.forEach((isAdmin, subscribedUsername) => sendUpdate(subscribedUsername, isAdmin))
            }
        }

        const onSubscriptionUp = ({user, clientId, subscriptionId}) => {
            const {username} = user
            const isAdmin = userIsAdmin(user)
            log.debug(() => `Subscription up: ${username} (${subscriptionId})`)
            subscriptions.set(subscriptionId, {username, isAdmin, clientId})
            sendSnapshot({username, isAdmin, clientId, subscriptionId})
        }

        const onSubscriptionDown = ({subscriptionId}) => {
            subscriptions.delete(subscriptionId)
        }

        const onClientDown = ({clientId}) => {
            for (const [subscriptionId, subscription] of subscriptions) {
                if (subscription.clientId === clientId) {
                    subscriptions.delete(subscriptionId)
                }
            }
        }

        const onUserDown = ({user: {username}}) => {
            for (const [subscriptionId, subscription] of subscriptions) {
                if (subscription.username === username) {
                    subscriptions.delete(subscriptionId)
                }
            }
        }

        const EVENT_HANDLERS = {
            subscriptionUp: onSubscriptionUp,
            subscriptionDown: onSubscriptionDown,
            clientDown: onClientDown,
            userDown: onUserDown,
        }

        messageChanged$
            .pipe(takeUntil(stop$))
            .subscribe({
                next: change => onChanged(change),
                error: error => log.error('Unexpected messageChanged$ stream error', error),
            })

        return message => {
            const {event, user, data, clientId, subscriptionId} = message
            if (event) {
                const handler = EVENT_HANDLERS[event]
                if (handler) {
                    handler({user, clientId, subscriptionId})
                } else {
                    log.trace(() => `Ignoring event: ${event}`)
                }
            } else if (data) {
                if (data.refresh) {
                    const subscription = subscriptions.get(subscriptionId)
                    const isAdmin = subscription ? subscription.isAdmin : userIsAdmin(user)
                    sendSnapshot({username: user.username, isAdmin, clientId, subscriptionId})
                } else {
                    log.warn('Unsupported message data:', data)
                }
            } else {
                log.warn('Unsupported message:', message)
            }
        }
    }

const createMessageWs = ({userNotifications, messageChanged$}) =>
    moduleWs$(createMessageWsProtocol({userNotifications, messageChanged$}))

export {createMessageWs, createMessageWsProtocol}
