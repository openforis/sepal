// Test harness builders for the chat slice. Each builder wires the real
// domain object with in-memory port-fakes and side-effect collectors.
// Test bodies pin behaviour at the stable seam by writing then reading
// the collectors — never via call-spying.

const {Subject, defer, from, of, tap} = require('rxjs')
const {createConversation} = require('#mcp/chat/conversation/conversation')
const {createConversations} = require('#mcp/chat/conversation/conversations')
const {createGuiContexts} = require('#mcp/chat/conversation/guiContexts')
const {createMessageHandler} = require('#mcp/chat/conversation/messageHandler')
const {createTitleGenerator} = require('#mcp/chat/conversation/titleGenerator')
const {createUserChat} = require('#mcp/chat/conversation/userChat')
const {createWsHandler} = require('#mcp/chat/conversation/wsHandler')
const {createToolRegistry} = require('#mcp/chat/tools/registry')
const {specialistConsultationTools} = require('#mcp/chat/specialists/specialistConsultationTools')
const {describeRecipeTool, updateRecipeTool} = require('#mcp/chat/specialists/recipeSpecialists')

function aRegistryHarness({tools, bus = aRecordingBus()} = {}) {
    const registry = createToolRegistry({tools, bus})
    return {
        registry,
        bus,
        invoke$(toolCall, context) {
            return registry.invoke$(toolCall, context)
        },
        invoke(toolCall, context) {
            return readSync(registry.invoke$(toolCall, context))
        }
    }
}

const SPECIALIST_BUILDERS = {
    consult_map: ({llm, bus, innerTools}) =>
        specialistConsultationTools({llm, bus, innerTools})
            .find(tool => tool.name === 'consult_map'),
    describe_recipe: ({llm, bus, innerTools, guiRequests}) =>
        describeRecipeTool({llm, bus, innerTools, guiRequests}),
    update_recipe: ({llm, bus, innerTools, guiRequests}) =>
        updateRecipeTool({llm, bus, innerTools, guiRequests})
}

function aToolFactoryHarness({
    specialist = 'consult_map',
    replies = [{text: ''}],
    innerTools = aFakeInnerToolsFor(specialist),
    guiRequests = aFakeGuiRequests(),
    bus = aRecordingBus(),
    context = {conversationId: 'conv-1'}
} = {}) {
    const llm = aFakeLlm({replies})
    const build = SPECIALIST_BUILDERS[specialist]
    if (!build) throw new Error(`Unknown specialist: ${specialist}`)
    const tool = build({llm, bus, innerTools, guiRequests})
    return {
        tool,
        llm,
        bus,
        innerTools,
        guiRequests,
        invoke$(input, ctx = context) {
            return tool.invoke$(input, ctx)
        },
        invoke(input, ctx = context) {
            return readSync(tool.invoke$(input, ctx))
        }
    }
}

const INNER_TOOLS_BY_SPECIALIST = {
    consult_map: () => aFakeTools(
        {
            get_gui_context: () => of({section: 'process'}),
            map_area_list: () => of({recipeId: 'r1', layout: 'single', areas: []}),
            layer_list: () => of({recipeId: 'r1', areas: []})
        },
        [
            {name: 'get_gui_context', description: 'GUI context.', parameters: {type: 'object', properties: {}}},
            {name: 'map_area_list', description: 'Map areas.', parameters: {type: 'object', properties: {}}},
            {name: 'layer_list', description: 'Layers per area.', parameters: {type: 'object', properties: {}}}
        ]
    ),
    describe_recipe: () => aFakeTools(
        {recipe_load: () => of({id: 'r1', type: 'CLASSIFICATION'})},
        [{name: 'recipe_load', description: 'Load one recipe.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}}]
    ),
    update_recipe: () => aFakeTools(
        {
            prepare_update: () => of({ok: true, data: {baseModelHash: 'h1', focusPaths: [], dependentPaths: [], writablePaths: [], currentValues: {}, dependencyFacts: [], validationRules: []}}),
            recipe_patch: () => of({ok: true, data: {summary: 'patched', modelHash: 'h2', invalidatedPaths: []}})
        },
        [
            {
                name: 'prepare_update',
                description: 'Prepare a bounded edit for ONE recipe from formal focusPaths.',
                parameters: {type: 'object', properties: {recipeId: {type: 'string'}, focusPaths: {type: 'array', items: {type: 'string'}}}}
            },
            {
                name: 'recipe_patch',
                description: 'Apply JSON Patch to ONE recipe.',
                parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}
            }
        ]
    )
}

function aFakeInnerToolsFor(specialist) {
    const make = INNER_TOOLS_BY_SPECIALIST[specialist]
    if (!make) throw new Error(`No default inner tools for ${specialist}`)
    return make()
}

function aFakeLlm({replies = [{text: ''}]} = {}) {
    const receivedMessages = []
    const receivedTools = []
    const receivedRequests = []
    let i = 0
    return {
        receivedMessages,
        receivedTools,
        receivedRequests,
        respondTo$(request = {}) {
            const {messages, tools} = request
            receivedMessages.push(messages ? [...messages] : null)
            receivedTools.push(tools)
            receivedRequests.push(request)
            const reply = replies[Math.min(i++, replies.length - 1)]
            return from(replyToEvents(reply))
        }
    }
}

// An LLM whose calls return Subjects so the test can hold a turn mid-flight.
function aControllableLlm() {
    const calls = []
    return {
        calls,
        respondTo$({messages} = {}) {
            const subject = new Subject()
            calls.push({messages: messages ? [...messages] : null, subject})
            return subject
        }
    }
}

function replyToEvents(reply) {
    const events = []
    if (reply.text) events.push({textDelta: reply.text})
    if (reply.textChunks) reply.textChunks.forEach(chunk => events.push({textDelta: chunk}))
    if (reply.toolCalls) reply.toolCalls.forEach(toolCall => events.push({toolCall}))
    if (reply.responseMeta) events.push({responseMeta: reply.responseMeta})
    return events
}

function aFakeTools(implementations, schemas) {
    const invocations = []
    return {
        invocations,
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
            return impl(toolCall.input, context)
        }
    }
}

// Inner-registry double that only exposes the supplied schemas and accepts
// any call with a generic success — used to exercise a specialist's per-tool
// scope filter without wiring real implementations (the scoped wrapper blocks
// out-of-scope calls before they reach an implementation).
function innerToolsWithSchemas(schemas) {
    return {
        invocations: [],
        schemas: () => schemas,
        invoke$(toolCall) {
            this.invocations.push(toolCall)
            return of({ok: true, data: {}})
        }
    }
}

// Inner-registry double with both schemas() and per-name invoke$
// implementations.
function innerToolsImpl(implementations, schemas) {
    const invocations = []
    return {
        invocations,
        schemas: () => schemas,
        invoke$(toolCall, context) {
            invocations.push(toolCall)
            const impl = implementations[toolCall.name]
            if (!impl) return of({ok: false, error: {code: 'UNKNOWN_TOOL', message: toolCall.name}})
            return impl(toolCall.input, context)
        }
    }
}

function aConversationHarness({
    id = 'conv-1',
    initialMessages = [],
    replies = [{text: 'ok'}],
    tools = [],
    bus = aRecordingBus(),
    history = createInMemoryHistory(initialMessages),
    llm = aFakeLlm({replies})
} = {}) {
    const registry = createToolRegistry({tools, bus})
    const invocations = collectInvocations(registry)
    const conversation = createConversation({
        id, initialMessages, llm, history, tools: invocations.registry, bus
    })
    return {
        conversation,
        llm,
        bus,
        history,
        invocations: invocations.calls,
        send$(text, opts) {
            return conversation.sendUserMessage$(text, opts)
        }
    }
}

function aUserChatHarness({
    conversationIds = ['conv-1'],
    replies = [{text: 'ok'}],
    tools = [],
    initialMessagesById = {},
    clock = aFixedClock(1700000000000),
    bus = aRecordingBus(),
    llm = aFakeLlm({replies}),
    conversationsStore = createInMemoryConversationsStore(),
    titleGenerator = 'silent'
} = {}) {
    const registry = createToolRegistry({tools, bus})
    const invocations = collectInvocations(registry)
    const historiesById = new Map()
    const channelEvents = []
    const createId = sequentialIds(conversationIds)
    const conversations = createConversations({
        conversationsStore,
        conversationFor$: id => of(createConversation({
            id,
            initialMessages: initialMessagesById[id] || [],
            llm,
            history: historyFor(id),
            tools: invocations.registry,
            bus
        })),
        createId,
        clock
    })
    const guiContexts = createGuiContexts()
    const messageHandler = createMessageHandler({
        conversations, guiContexts,
        titleGenerator: resolveTitleGenerator(titleGenerator, {llm, conversationsStore, bus}),
        clock
    })
    const userChat = createUserChat({conversations, guiContexts, messageHandler, bus})

    return {
        userChat,
        llm,
        bus,
        conversationsStore,
        channelEvents,
        invocations: invocations.calls,
        historyFor,
        handle$(command) {
            return userChat.handle$(command).pipe(tap(event => channelEvents.push(event)))
        },
        // Window into channel events emitted after a marker — lets a test
        // assert on one action's output without resetting the shared collector.
        eventsMarker() {
            return channelEvents.length
        },
        eventsSince(marker) {
            return channelEvents.slice(marker)
        }
    }

    function historyFor(id) {
        if (!historiesById.has(id)) historiesById.set(id, createInMemoryHistory())
        return historiesById.get(id)
    }
}

function aWsHandlerHarness({
    conversationIds = ['conv-1'],
    replies = [{text: 'Hi there!'}],
    tools = [],
    bus = aRecordingBus(),
    guiRequests = aRecordingGuiRequests(),
    conversationsStore = createInMemoryConversationsStore(),
    userChatFor
} = {}) {
    const clock = aFixedClock(1700000000000)
    const llm = aFakeLlm({replies})
    const registry = createToolRegistry({tools, bus: aRecordingBus()})
    const createId = sequentialIds(conversationIds)
    const userChatCache = new Map()
    const defaultUserChatFor = username => {
        if (!userChatCache.has(username)) {
            const conversations = createConversations({
                conversationsStore,
                conversationFor$: id => of(createConversation({
                    id,
                    llm,
                    history: createInMemoryHistory(),
                    tools: registry,
                    bus: aRecordingBus()
                })),
                createId,
                clock
            })
            const guiContexts = createGuiContexts()
            const messageHandler = createMessageHandler({
                conversations, guiContexts,
                titleGenerator: aSilentTitleGenerator(),
                clock
            })
            userChatCache.set(username, createUserChat({
                conversations, guiContexts, messageHandler, bus: aRecordingBus()
            }))
        }
        return userChatCache.get(username)
    }
    const arg$ = new Subject()
    const sent = []
    const handler = createWsHandler({
        bus,
        guiRequests,
        userChatFor: userChatFor || defaultUserChatFor
    })
    handler({arg$}).subscribe(frame => sent.push(frame))

    return {
        arg$,
        sent,
        bus,
        guiRequests,
        llm,
        conversationsStore,
        feed(frame) { arg$.next(frame) },
        errorStream(error) { arg$.error(error) }
    }
}

function aRecordingGuiRequests() {
    const respondCalls = []
    const cancelCalls = []
    return {
        respondCalls,
        cancelCalls,
        respond(response) { respondCalls.push(response) },
        cancelForSubscription(subscription) { cancelCalls.push(subscription) }
    }
}

function createInMemoryConversationsStore(initial = []) {
    const conversations = new Map(initial.map(meta => [meta.id, meta]))
    return {add$, get$, touch$, updateTitle$, delete$, list$}

    function add$(meta) {
        return defer(() => {
            conversations.set(meta.id, meta)
            return of(undefined)
        })
    }

    function get$(id) {
        return defer(() => of(conversations.get(id)))
    }

    function touch$(id, updatedAt) {
        return defer(() => {
            const meta = conversations.get(id)
            if (!meta) return of(false)
            conversations.set(id, {...meta, updatedAt})
            return of(true)
        })
    }

    function updateTitle$(id, title) {
        return defer(() => {
            const meta = conversations.get(id)
            if (!meta) return of(false)
            conversations.set(id, {...meta, title})
            return of(true)
        })
    }

    function delete$(id) {
        return defer(() => of(conversations.delete(id)))
    }

    function list$() {
        return defer(() =>
            of([...conversations.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
        )
    }
}

function aSilentTitleGenerator() {
    return {afterTurn$: () => from([])}
}

// Title generator whose afterTurn$ never completes; lets us observe that
// the next turn proceeds despite the previous title still being in flight.
function aStallingTitleGenerator() {
    return {afterTurn$: () => new Subject()}
}

function resolveTitleGenerator(spec, {llm, conversationsStore, bus}) {
    if (spec === 'silent') return aSilentTitleGenerator()
    if (spec === 'real') return createTitleGenerator({llm, conversationsStore, bus})
    return spec
}

function aFixedClock(t) {
    return {
        now: () => t,
        nowIso: () => new Date(t).toISOString()
    }
}

function anAdvancingClock(times) {
    let i = 0
    const advance = () => times[Math.min(i++, times.length - 1)]
    return {
        now: advance,
        nowIso: () => new Date(advance()).toISOString()
    }
}

function sequentialIds(ids) {
    let i = 0
    return () => ids[Math.min(i++, ids.length - 1)]
}

// Wraps a registry to record every invocation. Spying on the production
// registry would mix HOW and THAT — this exposes invocations as a
// side-effect surface the test reads, matching the bus-events pattern.
function collectInvocations(registry) {
    const calls = []
    return {
        calls,
        registry: {
            schemas: () => registry.schemas(),
            flag: (name, flagName) => registry.flag(name, flagName),
            invoke$: (toolCall, context) => {
                calls.push(toolCall)
                return registry.invoke$(toolCall, context)
            }
        }
    }
}

function aFakeGuiRequests(handler = () => of({id: 'r1', type: 'CLASSIFICATION', name: 'Kenya', projectId: 'p1'})) {
    const requests = []
    return {
        requests,
        request$(request) {
            requests.push(request)
            return handler(request)
        }
    }
}

function aRecordingBus() {
    const events = []
    return {
        events,
        publish(event) { events.push(event) },
        track$(_name, _attrs, work$) { return work$ },
        track(_name, _attrs, work) { return work() }
    }
}

function createInMemoryHistory(initial = []) {
    const messages = [...initial]
    return {
        append$(message) {
            return defer(() => {
                messages.push(message)
                return of(undefined)
            })
        },
        load$() {
            return defer(() => of([...messages]))
        },
        clear$() {
            return defer(() => {
                messages.splice(0, messages.length)
                return of(undefined)
            })
        }
    }
}

function readSync(observable) {
    let value
    let errored
    observable.subscribe({
        next: v => { value = v },
        error: e => { errored = e }
    })
    if (errored) throw errored
    return value
}

// Subscribe-and-collect helpers shared by scenario tests. They turn a
// stream into a value the test can `await` / inspect directly so the
// `when` line stays inside the `it` body.
function collect(observable) {
    return new Promise((resolve, reject) => {
        const events = []
        observable.subscribe({
            next: event => events.push(event),
            error: reject,
            complete: () => resolve(events)
        })
    })
}

function firstValue(observable) {
    return new Promise((resolve, reject) => {
        observable.subscribe({next: resolve, error: reject})
    })
}

function run(observable) {
    observable.subscribe({error: e => { throw e }})
}

// Filters a list of channel events down to one kind. Shared across scenario
// directories — pass harness.channelEvents or harness.eventsSince(marker).
function eventsOfKind(events, kind) {
    return events.filter(event => event.kind === kind)
}

module.exports = {
    aRegistryHarness,
    aToolFactoryHarness,
    aConversationHarness,
    aUserChatHarness,
    aWsHandlerHarness,
    aFakeLlm,
    aControllableLlm,
    aStallingTitleGenerator,
    aRecordingBus,
    aRecordingGuiRequests,
    aFakeGuiRequests,
    anAdvancingClock,
    createInMemoryHistory,
    createInMemoryConversationsStore,
    collect,
    eventsOfKind,
    innerToolsWithSchemas,
    innerToolsImpl,
    firstValue,
    run
}
