function createWsChannel({out$, bus, username, clientId, subscriptionId}) {
    return {chatResponse, status, userMessage, conversationCreated, conversationClaimed, conversationUpdated, conversationLoaded, conversationDeleted, conversationsList, guiAction, toolStart, toolEnd}

    function chatResponse({conversationId, textDelta, complete}) {
        if (complete) {
            broadcast(
                {type: 'chat-response', conversationId, complete: true},
                `chat-response ${conversationId} complete`
            )
        } else if (textDelta !== undefined) {
            broadcast(
                {type: 'chat-response', conversationId, text: textDelta},
                `chat-response ${conversationId} text: ${JSON.stringify(textDelta)}`
            )
        }
    }

    function status(conversationId) {
        broadcast(
            {type: 'status', conversationId},
            `status ${conversationId}`
        )
    }

    function userMessage(conversationId, text) {
        broadcastExcept(
            {type: 'user-message', conversationId, text},
            `user-message ${conversationId}: ${JSON.stringify(text)}`
        )
    }

    function conversationCreated({id, ...meta}) {
        targeted(
            {type: 'conversation-created', conversationId: id, ...meta},
            `conversation-created ${id}`
        )
    }

    function conversationClaimed({id, ...meta}) {
        broadcastExcept(
            {type: 'conversation-claimed', conversationId: id, ...meta},
            `conversation-claimed ${id}`
        )
    }

    function conversationUpdated({id, ...meta}) {
        broadcast(
            {type: 'conversation-updated', conversationId: id, ...meta},
            `conversation-updated ${id}`
        )
    }

    function conversationLoaded(conversationId, messages) {
        targeted(
            {type: 'conversation-loaded', conversationId, messages},
            `conversation-loaded ${conversationId} (${messages.length} messages)`
        )
    }

    function conversationDeleted(conversationId) {
        broadcast(
            {type: 'conversation-deleted', conversationId},
            `conversation-deleted ${conversationId}`
        )
    }

    function conversationsList(conversations) {
        targeted(
            {type: 'conversations', conversations},
            `conversations (${conversations.length})`
        )
    }

    function guiAction({requestId, action, params}) {
        targeted(
            {type: 'gui-action', requestId, action, params},
            `gui-action ${action} (${requestId})`
        )
    }

    function toolStart({conversationId, toolCallId, toolName, input}) {
        broadcast(
            {type: 'tool-start', conversationId, toolCallId, toolName, input},
            `tool-start ${toolName} ${conversationId}`
        )
    }

    function toolEnd({conversationId, toolCallId, toolName, ok, data, error}) {
        broadcast(
            {type: 'tool-end', conversationId, toolCallId, toolName, ok, data, error},
            `tool-end ${toolName} ${conversationId} ok=${ok}`
        )
    }

    function broadcast(data, summary) {
        emit({username, data}, `WS out (${username} broadcast) ${summary}`)
    }

    function broadcastExcept(data, summary) {
        emit({username, excludeClientId: clientId, data}, `WS out (${username} broadcast except ${clientId}) ${summary}`)
    }

    function targeted(data, summary) {
        emit({username, clientId, subscriptionId, data}, `WS out ${clientId}:${subscriptionId} (${username}) ${summary}`)
    }

    function emit(wireMessage, message) {
        out$.next(wireMessage)
        bus.publish({type: 'wsOut', level: 'debug', message, ...wireMessage})
    }
}

module.exports = {createWsChannel}
