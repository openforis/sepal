const {of, from, defer, throwError} = require('rxjs')
const {createConversation} = require('#mcp/chat/sendMessage/conversation')

function aConversation({
    llm = aFakeLlm(),
    history = aFakeHistory(),
    tools = aFakeTools(),
    tracer = aFakeTracer(),
    systemPrompt = null,
    initialMessages = [],
    id = 'conv1'
} = {}) {
    return createConversation({llm, history, tools, tracer, systemPrompt, initialMessages, id})
}

function aFakeTracer() {
    const spans = []
    return {
        span$(name, attrs, work$) {
            spans.push({name, attrs})
            return work$
        },
        spans
    }
}

function aFakeLlm({replies = [{text: 'response'}]} = {}) {
    const receivedMessages = []
    let i = 0
    return {
        respondTo$({messages} = {}) {
            receivedMessages.push(messages ? [...messages] : null)
            const reply = replies[Math.min(i++, replies.length - 1)]
            return from(replyToEvents(reply))
        },
        receivedMessages
    }
}

function replyToEvents(reply) {
    const events = []
    if (reply.text) events.push({textDelta: reply.text})
    if (reply.textChunks) reply.textChunks.forEach(chunk => events.push({textDelta: chunk}))
    if (reply.toolCalls) reply.toolCalls.forEach(toolCall => events.push({toolCall}))
    return events
}

function aFakeHistory() {
    const appended = []
    return {
        append$(message) {
            return defer(() => {
                appended.push(message)
                return of(undefined)
            })
        },
        appended
    }
}

function aFakeChannel() {
    const sent = []
    const created = []
    const loaded = []
    const claimed = []
    const deleted = []
    const lists = []
    const statuses = []
    const userMessages = []
    return {
        chatResponse(payload) { sent.push(payload) },
        status(conversationId) { statuses.push(conversationId) },
        userMessage(conversationId, text) { userMessages.push({conversationId, text}) },
        conversationCreated(meta) { created.push(meta) },
        conversationLoaded(conversationId, messages) { loaded.push({conversationId, messages}) },
        conversationClaimed(meta) { claimed.push(meta) },
        conversationDeleted(conversationId) { deleted.push(conversationId) },
        conversationsList(metas) { lists.push(metas) },
        sent, created, loaded, claimed, deleted, lists, statuses, userMessages
    }
}

function aFakeTools(implementations = {}) {
    const invocations = []
    return {
        invoke$(toolCall) {
            invocations.push(toolCall)
            const impl = implementations[toolCall.name]
            if (!impl) return throwError(() => new Error(`Unknown tool: ${toolCall.name}`))
            return impl(toolCall.input)
        },
        invocations
    }
}

function run(observable) {
    const events = []
    let completed = false
    observable.subscribe({
        next: event => events.push(event),
        complete: () => { completed = true },
        error: e => { throw e }
    })
    return {events, completed}
}

module.exports = {aFakeLlm, aFakeHistory, aFakeChannel, aFakeTools, aFakeTracer, aConversation, run}
