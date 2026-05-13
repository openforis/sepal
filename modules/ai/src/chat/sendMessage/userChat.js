function createUserChat({conversationsStore, newConversation, clock}) {
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
        const conversation = newConversation()
        const now = nowIso()
        const meta = {id: conversation.id, title: '', createdAt: now, updatedAt: now}
        conversations.set(conversation.id, conversation)
        conversationsStore.add(meta)
        channel.conversationCreated(meta)
        channel.conversationClaimed(meta)
        return conversation.id
    }

    function selectConversation(channel, id) {
        const conversation = conversations.get(id)
        if (!conversation) return
        channel.conversationLoaded(id, conversation.messagesSnapshot())
        return id
    }

    function deleteConversation(channel, id) {
        if (!conversations.delete(id)) return
        stop(id)
        conversationsStore.delete(id)
        channel.conversationDeleted(id)
    }

    function deleteAllConversations(channel) {
        [...conversations.keys()].forEach(id => deleteConversation(channel, id))
    }

    function listConversations(channel) {
        channel.conversationsList(conversationsStore.list())
    }

    function sendUserMessage(channel, conversationId, text) {
        const conversation = conversations.get(conversationId)
        if (!conversation) return
        conversationsStore.touch(conversationId, nowIso())
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

    function nowIso() {
        return new Date(clock.now()).toISOString()
    }
}

module.exports = {createUserChat}
