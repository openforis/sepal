// Inbound WS protocol adapter. Decodes the WS envelope (heartbeat /
// gateway event / data), tracks the live subscriptions on one
// connection, hands chat-data messages to the subscription's UserChat,
// routes gui-response messages back to guiRequests, and publishes
// message-level observability to the bus.

const {Subject, startWith} = require('rxjs')
const {createWsChannel} = require('./wsChannel')

function createWsHandler({bus, userChatFor, guiRequests}) {
    return onConnection

    function onConnection(ctx) {
        const out$ = new Subject()
        const subscriptions = new Map()

        ctx.arg$.subscribe({
            next: receive,
            error: error => bus.publish({
                type: 'wsConnectionError',
                level: 'error',
                message: `WS connection errored: ${error.message}`,
                error
            })
        })

        return out$.pipe(startWith({ready: true}))

        function receive(message) {
            try {
                if (isIgnored(message)) handleIgnored(message)
                else if (message.event) handleSubscriptionEvent(message)
                else handleData(message)
            } catch (error) {
                bus.publish({
                    type: 'wsRouteError',
                    level: 'error',
                    message: `WS handler threw on message: ${error.message}`,
                    error
                })
            }
        }

        function handleIgnored(message) {
            const subscription = subscriptionOf(message)
            publish('ignored', subscription, ignoredAttrs(message), 'trace')
        }

        function handleSubscriptionEvent(message) {
            const subscription = subscriptionOf(message)
            if (message.event === 'subscriptionUp') subscribeUp(subscription)
            else subscribeDown(subscription)
        }

        function handleData(message) {
            const subscription = subscriptionOf(message)
            const {type, ...args} = message.data
            if (type === 'gui-response') {
                publish('gui-response', subscription, args, 'debug')
                guiRequests.respond({clientId: subscription.clientId, subscriptionId: subscription.subscriptionId, ...args})
            } else {
                dispatchChatCommand(subscription, type, args)
            }
        }

        function dispatchChatCommand(subscription, type, args) {
            const entry = subscriptions.get(keyOf(subscription))
            if (!entry) return
            publish(type, subscription, args, levelFor(type))
            runWork$(entry.userChat.handle$({
                type,
                clientId: subscription.clientId, subscriptionId: subscription.subscriptionId,
                ...args
            }), entry.channel)
        }

        function subscribeUp(subscription) {
            publish('subscriptionUp', subscription)
            const channel = createWsChannel({out$, bus, ...subscription})
            const userChat = userChatFor(subscription.username)
            subscriptions.set(keyOf(subscription), {channel, userChat})
            runWork$(userChat.handle$({type: 'list-conversations'}), channel)
        }

        function subscribeDown(subscription) {
            publish('subscriptionDown', subscription)
            const {clientId, subscriptionId} = subscription
            const entry = subscriptions.get(keyOf(subscription))
            if (entry) runWork$(entry.userChat.handle$({type: 'clear-context', clientId, subscriptionId}), entry.channel)
            guiRequests.cancelForSubscription({clientId, subscriptionId})
            subscriptions.delete(keyOf(subscription))
        }

        function publish(kind, subscription, attrs = {}, level = 'info') {
            bus.publish({
                type: 'wsIn',
                kind,
                level,
                message: format(kind, subscription, attrs),
                ...subscription,
                ...attrs
            })
        }

        function runWork$(work$, channel) {
            work$.subscribe({
                next: event => channel.dispatch(event),
                error: error => bus.publish({
                    type: 'workFailed',
                    level: 'error',
                    message: `WS work failed: ${error.message}`,
                    error
                })
            })
        }
    }
}

function levelFor(type) {
    return type === 'context' ? 'debug' : 'info'
}

function isIgnored(message) {
    return message.hb !== undefined
        || (message.event && message.event !== 'subscriptionUp' && message.event !== 'subscriptionDown')
        || (!message.event && !message.data?.type)
}

function ignoredAttrs(message) {
    if (message.hb !== undefined) return {reason: 'heartbeat'}
    if (message.event) return {reason: 'gatewayEvent', event: message.event}
    return {reason: 'empty'}
}

function format(kind, subscription, attrs) {
    const label = subscriptionLabel(subscription)
    if (kind === 'ignored' && attrs.reason === 'heartbeat') return 'WS in heartbeat'
    if (kind === 'ignored' && attrs.reason === 'gatewayEvent') return `WS in ${label} ignored event: ${attrs.event}`
    if (kind === 'ignored') return `WS in ${label} ignored (empty)`
    if (kind === 'message') return `WS in ${label} message ${attrs.conversationId}: ${JSON.stringify(attrs.text)}`
    if (attrs.conversationId) return `WS in ${label} ${kind} ${attrs.conversationId}`
    return `WS in ${label} ${kind}`
}

function subscriptionLabel({clientId, subscriptionId, username}) {
    return `${clientId}:${subscriptionId} (${username})`
}

function subscriptionOf({user, clientId, subscriptionId}) {
    return {username: user?.username, clientId, subscriptionId}
}

function keyOf({clientId, subscriptionId}) {
    return `${clientId}:${subscriptionId}`
}

module.exports = {createWsHandler}
