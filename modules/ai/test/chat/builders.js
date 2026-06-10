import {catchError, defer, EMPTY, from, map, of, Subject, throwError} from 'rxjs'

import {createConversation} from '#mcp/chat/conversation/conversation'
import {createDiagnostics} from '#mcp/chat/diagnostics'
import {getRecipeHandles} from '#recipes'

function aConversation({
    llm = aFakeLlm(),
    history = aFakeHistory(),
    tools = aFakeTools(),
    initialMessages = [],
    id = 'conv1',
    bus = aFakeBus(),
    diagnostics = createDiagnostics()
} = {}) {
    return createConversation({llm, history, tools, initialMessages, id, bus, diagnostics})
}

function aFakeLlm({replies = [{text: 'response'}]} = {}) {
    const receivedMessages = []
    const receivedTools = []
    const receivedRequests = []
    let i = 0
    return {
        respondTo$(request = {}) {
            const {messages, tools} = request
            receivedMessages.push(messages ? [...messages] : null)
            receivedTools.push(tools)
            receivedRequests.push(request)
            const reply = replies[Math.min(i++, replies.length - 1)]
            return from(replyToEvents(reply))
        },
        receivedMessages,
        receivedTools,
        receivedRequests
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

// Records every channel event the subject dispatched, exposing both the
// raw events list and convenience per-kind arrays so existing assertions
// keep reading naturally.
function aFakeChannel() {
    const events = []
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
    const guiActions = []
    return {
        dispatch(event) {
            events.push(event)
            record(event)
        },
        events, sent, created, loaded, claimed, deleted, lists, statuses, userMessages, metaUpdates, toolStarts, toolEnds, notices, guiActions
    }

    function record({kind, payload}) {
        if (kind === 'chat-response') {
            sent.push(payload.complete
                ? {conversationId: payload.conversationId, complete: true}
                : {conversationId: payload.conversationId, textDelta: payload.text})
        } else if (kind === 'status') {
            statuses.push(payload.conversationId)
        } else if (kind === 'user-message') {
            userMessages.push({conversationId: payload.conversationId, text: payload.text})
        } else if (kind === 'conversation-created') {
            created.push(metaFromPayload(payload))
        } else if (kind === 'conversation-claimed') {
            claimed.push(metaFromPayload(payload))
        } else if (kind === 'conversation-updated') {
            metaUpdates.push(metaFromPayload(payload))
        } else if (kind === 'conversation-loaded') {
            loaded.push({conversationId: payload.conversationId, messages: payload.messages})
        } else if (kind === 'conversation-deleted') {
            deleted.push(payload.conversationId)
        } else if (kind === 'conversations') {
            lists.push(payload.conversations)
        } else if (kind === 'gui-action') {
            guiActions.push({requestId: payload.requestId, action: payload.action, params: payload.params})
        } else if (kind === 'tool-start') {
            toolStarts.push(payload)
        } else if (kind === 'tool-end') {
            toolEnds.push(payload)
        } else if (kind === 'assistant-notice') {
            notices.push(payload)
        }
    }
}

function metaFromPayload({conversationId, ...rest}) {
    return {id: conversationId, ...rest}
}

function aFakeTools(implementations = {}, schemas = []) {
    const invocations = []
    return {
        schemas() {
            return schemas.map(({name, description, parameters}) => ({name, description, parameters}))
        },
        flag(name, flagName) {
            return schemas.find(schema => schema.name === name)?.[flagName] === true
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
    const spans = []
    return {
        publish(event) { published.push(event) },
        track$(name, attrs, work$) {
            spans.push({name, attrs})
            return work$
        },
        async track(name, attrs, work) {
            spans.push({name, attrs})
            return work()
        },
        published,
        spans
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

// Recursively scans a model-facing payload for JSON-Pointer-shaped strings
// (the handle paths a recipe spec maps its handles to). Surfaces a leak as a
// readable failure; ignore by passing the user-provided fields under `ignore`
// (e.g. the original instruction prose).
function expectNoHandlePathsIn(value, {recipeType = 'MOSAIC', ignore = []} = {}) {
    const handlePaths = (getRecipeHandles(recipeType) || []).map(handle => handle.path)
    const ignoreSet = new Set(ignore)
    const serialized = serializeFor(value, ignoreSet)
    const leaked = handlePaths.filter(path => serialized.includes(path))
    if (leaked.length) {
        throw new Error(`expected pathless content; leaked handle paths: ${leaked.join(', ')}`)
    }
}

function serializeFor(value, ignoreSet) {
    if (typeof value === 'string') return value
    return JSON.stringify(value, (key, fieldValue) => ignoreSet.has(key) ? undefined : fieldValue)
}

function aFakeDiagnostics(opts) {
    return createDiagnostics(opts)
}

export {
    aControllableLlm,
    aControllableTitleGenerator,
    aConversation,
    aFakeBus,
    aFakeChannel,
    aFakeDiagnostics,
    aFakeGuiRequests,
    aFakeHistory,
    aFakeLlm,
    aFakeTitleGenerator,
    aFakeTools,
    expectNoHandlePathsIn,
    read,
    readError,
    run
}
