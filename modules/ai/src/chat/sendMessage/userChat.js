const {concatMap, filter, map, of, tap} = require('rxjs')

function createUserChat({conversationsStore, conversationFor$, createId, clock}) {
    const conversations = new Map()
    const inFlight = new Map()

    return {
        createConversation,
        selectConversation,
        deleteConversation,
        deleteAllConversations,
        listConversations,
        sendUserMessage,
        abort
    }

    function createConversation(channel) {
        const id = createId()
        const now = nowIso()
        const meta = {id, title: '', createdAt: now, updatedAt: now}
        run$(conversationFor$(id).pipe(
            concatMap(conversation =>
                conversationsStore.add$(meta).pipe(map(() => conversation))
            ),
            tap(conversation => {
                conversations.set(id, conversation)
                channel.conversationCreated(meta)
                channel.conversationClaimed(meta)
            })
        ))
        return id
    }

    function selectConversation(channel, id) {
        run$(conversation$(id).pipe(
            tap(conversation => channel.conversationLoaded(id, conversation.messagesSnapshot()))
        ))
    }

    function deleteConversation(channel, id) {
        stop(id)
        conversations.delete(id)
        run$(conversationsStore.delete$(id).pipe(
            tap(deleted => {
                if (deleted) channel.conversationDeleted(id)
            })
        ))
    }

    function deleteAllConversations(channel) {
        run$(conversationsStore.list$().pipe(
            tap(metas => metas.forEach(meta => deleteConversation(channel, meta.id)))
        ))
    }

    function listConversations(channel) {
        run$(conversationsStore.list$().pipe(
            tap(metas => channel.conversationsList(metas))
        ))
    }

    function sendUserMessage(channel, conversationId, text) {
        run$(conversation$(conversationId).pipe(
            concatMap(conversation =>
                conversationsStore.touch$(conversationId, nowIso()).pipe(
                    filter(touched => touched),
                    map(() => conversation)
                )
            ),
            tap(conversation => send(channel, conversation, conversationId, text))
        ))
    }

    function send(channel, conversation, conversationId, text) {
        channel.status(conversationId)
        channel.userMessage(conversationId, text)
        const subscription = conversation.sendUserMessage$(text).subscribe({
            next: event => channel.chatResponse({conversationId, ...event}),
            complete: () => {
                inFlight.delete(conversationId)
                channel.chatResponse({conversationId, complete: true})
            }
        })
        inFlight.set(conversationId, subscription)
    }

    function abort(channel, conversationId) {
        if (!stop(conversationId)) return
        channel.chatResponse({conversationId, complete: true})
    }

    function stop(conversationId) {
        const subscription = inFlight.get(conversationId)
        if (!subscription) return false
        inFlight.delete(conversationId)
        subscription.unsubscribe()
        return true
    }

    function conversation$(id) {
        const cached = conversations.get(id)
        if (cached) return of(cached)
        return conversationsStore.get$(id).pipe(
            filter(Boolean),
            concatMap(() => conversationFor$(id).pipe(
                tap(conversation => conversations.set(id, conversation))
            ))
        )
    }

    function run$(work$) {
        work$.subscribe()
    }

    function nowIso() {
        return new Date(clock.now()).toISOString()
    }
}

module.exports = {createUserChat}
