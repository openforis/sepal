const {EMPTY, of, from, defer, throwError, catchError, map} = require('rxjs')
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
    const receivedTools = []
    let i = 0
    return {
        respondTo$({messages, tools} = {}) {
            receivedMessages.push(messages ? [...messages] : null)
            receivedTools.push(tools)
            const reply = replies[Math.min(i++, replies.length - 1)]
            return from(replyToEvents(reply))
        },
        receivedMessages,
        receivedTools
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
    const metaUpdates = []
    const toolStarts = []
    const toolEnds = []
    return {
        chatResponse(payload) { sent.push(payload) },
        status(conversationId) { statuses.push(conversationId) },
        userMessage(conversationId, text) { userMessages.push({conversationId, text}) },
        conversationCreated(meta) { created.push(meta) },
        conversationLoaded(conversationId, messages) { loaded.push({conversationId, messages}) },
        conversationClaimed(meta) { claimed.push(meta) },
        conversationUpdated(meta) { metaUpdates.push(meta) },
        conversationDeleted(conversationId) { deleted.push(conversationId) },
        conversationsList(metas) { lists.push(metas) },
        toolStart(payload) { toolStarts.push(payload) },
        toolEnd(payload) { toolEnds.push(payload) },
        sent, created, loaded, claimed, deleted, lists, statuses, userMessages, metaUpdates, toolStarts, toolEnds
    }
}

function aFakeTools(implementations = {}, schemas = []) {
    const invocations = []
    return {
        schemas() {
            return schemas
        },
        invoke$(toolCall, context) {
            invocations.push(toolCall)
            const impl = implementations[toolCall.name]
            if (!impl) {
                return of({ok: false, error: {code: 'UNKNOWN_TOOL', message: `Tool not found: ${toolCall.name}`}})
            }
            return impl(toolCall.input, context).pipe(
                map(data => ({ok: true, data})),
                catchError(error => of({ok: false, error: {code: 'TOOL_FAILED', message: error.message}}))
            )
        },
        invocations
    }
}

function aFakeTitleGenerator() {
    const afterTurns = []
    return {
        afterTurn$(args) {
            afterTurns.push(args)
            return EMPTY
        },
        afterTurns
    }
}

function aFakeGuiRequests(handler = () => of(undefined)) {
    const requests = []
    return {
        request$(request) {
            requests.push(request)
            return handler(request)
        },
        requests
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

function read(observable) {
    let value
    observable.subscribe({
        next: v => { value = v },
        error: e => { throw e }
    })
    return value
}

function readError(observable) {
    let error
    observable.subscribe({
        next: () => {},
        error: e => { error = e }
    })
    return error
}

module.exports = {aFakeLlm, aFakeHistory, aFakeChannel, aFakeTools, aFakeTracer, aFakeTitleGenerator, aFakeGuiRequests, aConversation, run, read, readError}
