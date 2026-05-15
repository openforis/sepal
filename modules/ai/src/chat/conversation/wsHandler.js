const {Subject, startWith} = require('rxjs')
const {createWsChannel} = require('./wsChannel')
const {COMMANDS} = require('./userChat')

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
                else handleCommand(message)
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

        function handleCommand(message) {
            const subscription = subscriptionOf(message)
            const {clientId, subscriptionId} = subscription
            const {type, ...args} = message.data
            const method = COMMANDS[type]
            if (method) {
                publish(type, subscription, args)
                dispatchTo(subscription, ({userChat, channel}) =>
                    userChat[method]({channel, clientId, subscriptionId, ...args}))
            } else if (type === 'context') {
                publish('context', subscription, args, 'debug')
                dispatchTo(subscription, ({userChat}) =>
                    userChat.updateContext$({clientId, subscriptionId, selection: args.selection}))
            } else if (type === 'gui-response') {
                publish('gui-response', subscription, args, 'debug')
                guiRequests.respond({clientId, subscriptionId, ...args})
            } else {
                publish('unknown', subscription, {dataType: type}, 'warn')
            }
        }

        function subscribeUp(subscription) {
            publish('subscriptionUp', subscription)
            const channel = createWsChannel({out$, bus, ...subscription})
            const userChat = userChatFor(subscription.username)
            subscriptions.set(keyOf(subscription), {channel, userChat})
            runWork$(userChat.listConversations$({channel}))
        }

        function subscribeDown(subscription) {
            publish('subscriptionDown', subscription)
            const {clientId, subscriptionId} = subscription
            dispatchTo(subscription, ({userChat}) =>
                userChat.clearContext$({clientId, subscriptionId}))
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

        function dispatchTo(subscription, work$For) {
            const entry = subscriptions.get(keyOf(subscription))
            if (entry) runWork$(work$For(entry))
        }

        function runWork$(work$) {
            work$.subscribe({
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
    if (kind === 'unknown') return `WS in ${label} unknown data type: ${attrs.dataType} (ignored)`
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
