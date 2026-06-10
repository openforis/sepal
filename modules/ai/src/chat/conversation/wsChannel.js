// Outbound WS channel for one subscription. dispatch takes a typed
// channel event and routes it to the right audience.

function createWsChannel({out$, bus, username, clientId, subscriptionId}) {
    return {dispatch}

    function dispatch({kind, targeting, payload}) {
        const wireMessage = {type: kind, ...payload}
        const summary = formatSummary(kind, payload)
        if (targeting === 'broadcast') broadcast(wireMessage, summary)
        else if (targeting === 'broadcastExcept') broadcastExcept(wireMessage, summary)
        else if (targeting === 'targeted') targeted(wireMessage, summary)
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

function formatSummary(kind, payload) {
    if (kind === 'chat-response') {
        if (payload.complete) return `chat-response ${payload.conversationId} complete`
        return `chat-response ${payload.conversationId} text: ${JSON.stringify(payload.text)}`
    }
    if (kind === 'status') return `status ${payload.conversationId}`
    if (kind === 'user-message') return `user-message ${payload.conversationId}: ${JSON.stringify(payload.text)}`
    if (kind === 'conversation-created') return `conversation-created ${payload.conversationId}`
    if (kind === 'conversation-claimed') return `conversation-claimed ${payload.conversationId}`
    if (kind === 'conversation-updated') return `conversation-updated ${payload.conversationId}`
    if (kind === 'conversation-loaded') return `conversation-loaded ${payload.conversationId} (${payload.messages.length} messages)`
    if (kind === 'conversation-deleted') return `conversation-deleted ${payload.conversationId}`
    if (kind === 'conversations') return `conversations (${payload.conversations.length})`
    if (kind === 'gui-action') return `gui-action ${payload.action} (${payload.requestId})`
    if (kind === 'tool-start') return `tool-start ${payload.toolName} ${payload.conversationId}`
    if (kind === 'tool-end') return `tool-end ${payload.toolName} ${payload.conversationId} ok=${payload.ok}`
    if (kind === 'assistant-notice') return `assistant-notice ${payload.conversationId} key=${payload.display?.key ?? '-'}`
    return kind
}

export {createWsChannel}
