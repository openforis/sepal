const {EMPTY, Subject, of, from, defer, throwError, catchError, map} = require('rxjs')
const {createConversation} = require('#mcp/chat/conversation/conversation')

function aConversation({
    llm = aFakeLlm(),
    history = aFakeHistory(),
    tools = aFakeTools(),
    tracer = aFakeTracer(),
    initialMessages = [],
    id = 'conv1',
    bus = aFakeBus()
} = {}) {
    return createConversation({llm, history, tools, tracer, initialMessages, id, bus})
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

// An LLM whose calls return Subjects the test drives by hand — to hold a turn mid-flight.
function aControllableLlm() {
    const calls = []
    return {
        respondTo$({messages} = {}) {
            const subject = new Subject()
            calls.push({messages: messages ? [...messages] : null, subject})
            return subject
        },
        calls
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
    const notices = []
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
        assistantNotice(payload) { notices.push(payload) },
        sent, created, loaded, claimed, deleted, lists, statuses, userMessages, metaUpdates, toolStarts, toolEnds, notices
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
                map(value => isEnvelope(value) ? value : {ok: true, data: value}),
                catchError(error => of({ok: false, error: {code: 'TOOL_FAILED', message: error.message}}))
            )
        },
        invocations
    }
}

function isEnvelope(value) {
    return value != null && typeof value === 'object' && typeof value.ok === 'boolean'
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

// A title generator whose afterTurn$ stays pending until the test completes its Subject.
function aControllableTitleGenerator() {
    const calls = []
    return {
        afterTurn$(args) {
            const subject = new Subject()
            calls.push({...args, subject})
            return subject
        },
        calls
    }
}

function aFakeBus() {
    const published = []
    return {
        publish(event) { published.push(event) },
        published
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

module.exports = {
    aConversation,
    aControllableLlm,
    aControllableTitleGenerator,
    aFakeBus,
    aFakeChannel,
    aFakeGuiRequests,
    aFakeHistory,
    aFakeLlm,
    aFakeTitleGenerator,
    aFakeTools,
    aFakeTracer,
    read,
    readError,
    run
}
