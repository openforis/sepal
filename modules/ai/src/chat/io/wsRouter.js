const ROUTES = {
    'event:subscriptionUp':     {kind: 'subscriptionUp',     handle: (h, s) => h.subscribe(s)},
    'event:subscriptionDown':   {kind: 'subscriptionDown',   handle: (h, s) => h.unsubscribe(s)},
    'data:create-conversation': {kind: 'createConversation', handle: (h, s) => h.createConversation(s)},
    'data:select-conversation': {
        kind: 'selectConversation',
        attrs: m => ({conversationId: m.data.conversationId}),
        handle: (h, s, m) => h.selectConversation(s, m.data.conversationId)
    },
    'data:delete-conversation': {
        kind: 'deleteConversation',
        attrs: m => ({conversationId: m.data.conversationId}),
        handle: (h, s, m) => h.deleteConversation(s, m.data.conversationId)
    },
    'data:list-conversations': {kind: 'listConversations', handle: (h, s) => h.listConversations(s)},
    'data:context': {kind: 'context', level: 'debug', handle: () => {}},
    'data:abort': {
        kind: 'abort',
        attrs: m => ({conversationId: m.data.conversationId}),
        handle: (h, s, m) => h.abort(s, m.data.conversationId)
    },
    'data:message': {
        kind: 'message',
        attrs: m => ({conversationId: m.data.conversationId, text: m.data.text}),
        handle: (h, s, m) => h.sendUserMessage(s, m.data.conversationId, m.data.text)
    }
}

function createWsRouter({bus, handlers}) {
    return {receive}

    function receive(message) {
        if (message.hb !== undefined) return
        const subscription = subscriptionOf(message)
        const route = lookup(message)
        if (route) {
            const extras = route.attrs?.(message) ?? {}
            publish(route.level ?? 'info', route.kind, subscription, extras)
            route.handle(handlers, subscription, message)
        } else if (message.data?.type) {
            publish('warn', 'unknown', subscription, {dataType: message.data.type})
        }
    }

    function publish(level, kind, subscription, extras) {
        bus.publish({
            type: 'wsIn',
            kind,
            level,
            message: format(kind, subscription, extras),
            ...subscription,
            ...extras
        })
    }
}

function format(kind, subscription, extras) {
    const label = subscriptionLabel(subscription)
    if (kind === 'message') return `WS in ${label} message ${extras.conversationId}: ${JSON.stringify(extras.text)}`
    if (kind === 'unknown') return `WS in ${label} unknown data type: ${extras.dataType} (ignored)`
    if (extras.conversationId) return `WS in ${label} ${kind} ${extras.conversationId}`
    return `WS in ${label} ${kind}`
}

function subscriptionLabel({clientId, subscriptionId, username}) {
    return `${clientId}:${subscriptionId} (${username})`
}

function lookup({event, data}) {
    if (event) return ROUTES[`event:${event}`]
    if (data?.type) return ROUTES[`data:${data.type}`]
}

function subscriptionOf({user, clientId, subscriptionId}) {
    return {username: user?.username, clientId, subscriptionId}
}

module.exports = {createWsRouter}
