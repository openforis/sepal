const {Subject, startWith} = require('rxjs')
const {createWsChannel} = require('./wsChannel')
const {createWsRouter} = require('./wsRouter')

function createWsHandler({bus, userChatFor}) {
    return onConnection

    function onConnection(ctx) {
        const out$ = new Subject()
        const subscriptions = new Map()

        const handlers = {
            subscribe(subscription) {
                const channel = createWsChannel({out$, bus, ...subscription})
                const userChat = userChatFor(subscription.username)
                subscriptions.set(keyOf(subscription), {channel, userChat})
            },
            unsubscribe(subscription) {
                subscriptions.delete(keyOf(subscription))
            },
            createConversation(subscription) {
                withSubscription(subscription, ({channel, userChat}) =>
                    userChat.createConversation(channel)
                )
            },
            selectConversation(subscription, id) {
                withSubscription(subscription, ({channel, userChat}) =>
                    userChat.selectConversation(channel, id)
                )
            },
            deleteConversation(subscription, id) {
                withSubscription(subscription, ({channel, userChat}) =>
                    userChat.deleteConversation(channel, id)
                )
            },
            listConversations(subscription) {
                withSubscription(subscription, ({channel, userChat}) =>
                    userChat.listConversations(channel)
                )
            },
            sendUserMessage(subscription, id, text) {
                withSubscription(subscription, ({channel, userChat}) =>
                    userChat.sendUserMessage(channel, id, text)
                )
            },
            abort(subscription, id) {
                withSubscription(subscription, ({channel, userChat}) =>
                    userChat.abort(channel, id)
                )
            }
        }

        const router = createWsRouter({bus, handlers})
        ctx.arg$.subscribe(router.receive)

        return out$.pipe(startWith({ready: true}))

        function withSubscription(subscription, action) {
            const entry = subscriptions.get(keyOf(subscription))
            if (entry) action(entry)
        }
    }
}

function keyOf({clientId, subscriptionId}) {
    return `${clientId}:${subscriptionId}`
}

module.exports = {createWsHandler}
