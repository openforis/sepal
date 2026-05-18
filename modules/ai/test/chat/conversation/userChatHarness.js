const {of, tap} = require('rxjs')
const {createConversation} = require('#mcp/chat/conversation/conversation')
const {createConversations} = require('#mcp/chat/conversation/conversations')
const {createGuiContexts} = require('#mcp/chat/conversation/guiContexts')
const {createMessageHandler} = require('#mcp/chat/conversation/messageHandler')
const {createUserChat} = require('#mcp/chat/conversation/userChat')
const {createInMemoryConversationsStore} = require('./inMemoryConversationsStore')
const {
    aFakeBus, aFakeChannel, aFakeHistory, aFakeLlm, aFakeTools, aFakeTitleGenerator, aFakeTracer
} = require('../builders')

const COMMAND_BY_METHOD = {
    createConversation$: 'create-conversation',
    selectConversation$: 'select-conversation',
    deleteConversation$: 'delete-conversation',
    deleteAllConversations$: 'delete-all-conversations',
    listConversations$: 'list-conversations',
    sendUserMessage$: 'message',
    abort$: 'abort',
    updateContext$: 'context',
    clearContext$: 'clear-context'
}

const T1 = 1700000000000
const T2 = T1 + 60000
const ISO_T1 = new Date(T1).toISOString()
const ISO_T2 = new Date(T2).toISOString()

function aUserChatFixture(overrides = {}) {
    const channel = overrides.channel ?? aFakeChannel()
    const llm = overrides.llm ?? aFakeLlm({replies: [{text: 'Hi!'}]})
    const userChat = aUserChat({...overrides, llm})
    return {channel, llm, userChat}
}

function aUserChat(overrides = {}) {
    const opts = {
        llm: aFakeLlm({replies: [{text: 'Hi!'}]}),
        tracer: aFakeTracer(),
        tools: aFakeTools(),
        createId: sequentialIds(['conv-1', 'conv-2', 'conv-3']),
        conversationsStore: createInMemoryConversationsStore(),
        initialMessagesById: {},
        createHistory: aFakeHistory,
        clock: aFixedClock(T1),
        titleGenerator: aFakeTitleGenerator(),
        ...overrides
    }
    const bus = opts.bus ?? aFakeBus()
    const conversations = opts.conversations ?? createConversations({
        conversationsStore: opts.conversationsStore,
        conversationFor$: id => of(createConversation({
            llm: opts.llm,
            tracer: opts.tracer,
            tools: opts.tools,
            history: opts.createHistory(id),
            initialMessages: opts.initialMessagesById[id] || [],
            id,
            bus
        })),
        createId: opts.createId,
        clock: opts.clock
    })
    const guiContexts = opts.guiContexts ?? createGuiContexts()
    const messageHandler = createMessageHandler({
        conversations, guiContexts,
        titleGenerator: opts.titleGenerator,
        clock: opts.clock
    })
    return withCommandMethods(createUserChat({
        conversations, guiContexts, messageHandler,
        tracer: opts.tracer,
        bus
    }))
}

// Tests pre-date the pure-dispatch UserChat and call methods like
// userChat.createConversation$({channel}) directly. This wrapper routes
// each call through handle$ and, if the caller supplied a channel,
// dispatches the channel events handle$ emits onto it — so existing
// channel.X assertions keep working.
function withCommandMethods(userChat) {
    const wrapped = {handle$: userChat.handle$}
    for (const [method, type] of Object.entries(COMMAND_BY_METHOD)) {
        wrapped[method] = ({channel, ...args} = {}) => {
            const work$ = userChat.handle$({type, ...args})
            return channel ? work$.pipe(tap(event => channel.dispatch(event))) : work$
        }
    }
    return wrapped
}

function sequentialIds(ids) {
    let i = 0
    return () => ids[Math.min(i++, ids.length - 1)]
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

function runtimeContextContent(messages) {
    return messages.find(message => message.content?.includes('<runtime-context>'))?.content
}

module.exports = {
    T1, T2, ISO_T1, ISO_T2,
    aUserChatFixture, aUserChat, anAdvancingClock, createInMemoryConversationsStore, runtimeContextContent
}
