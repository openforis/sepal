import {takeUntil} from 'rxjs'

import {getLogger} from '#sepal/log'
import {moduleWs$} from '#sepal/ws/module'

const log = getLogger('ws')

const asPayload = ({budgetUpdateRequest, ...spending}) => ({spending, budgetUpdateRequest})

const createBudgetWsProtocol = ({budgetManager, spending$}) =>
    ({send, stop$}) => {
        // subscriptionId → {username, clientId}
        const subscriptions = new Map()

        const subscribedUsernames = () =>
            new Set([...subscriptions.values()].map(({username}) => username))

        const sendSnapshot = async ({username, clientId, subscriptionId}) => {
            try {
                send({clientId, subscriptionId, data: asPayload(await budgetManager.userSpending(username))})
            } catch (error) {
                log.error(`Failed to send spending snapshot for ${username}`, error)
            }
        }

        const onSpending = ({username, spending}) => {
            if (subscribedUsernames().has(username)) {
                send({username, data: asPayload(spending)})
            }
        }

        const onSubscriptionUp = ({user: {username}, clientId, subscriptionId}) => {
            subscriptions.set(subscriptionId, {username, clientId})
            sendSnapshot({username, clientId, subscriptionId})
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

        spending$
            .pipe(takeUntil(stop$))
            .subscribe({
                next: value => onSpending(value),
            })

        return message => {
            const {event, user, data, clientId, subscriptionId} = message
            if (event) {
                const handler = EVENT_HANDLERS[event]
                if (handler) {
                    handler({user, clientId, subscriptionId})
                }
            } else if (data) {
                if (data.refresh) {
                    sendSnapshot({username: user.username, clientId, subscriptionId})
                } else {
                    log.warn('Unsupported message data:', data)
                }
            } else {
                log.warn('Unsupported message:', message)
            }
        }
    }

const createBudgetWs = ({budgetManager, spending$}) =>
    moduleWs$(createBudgetWsProtocol({budgetManager, spending$}))

export {createBudgetWs, createBudgetWsProtocol}
