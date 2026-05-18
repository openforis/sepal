const {of} = require('rxjs')
const {createConversation} = require('#mcp/chat/conversation/conversation')
const {createUserChat} = require('#mcp/chat/conversation/userChat')
const {createInMemoryConversationsStore} = require('./inMemoryConversationsStore')
const {
    aFakeChannel, aFakeHistory, aFakeLlm, aFakeTools, aFakeTitleGenerator, aFakeTracer
} = require('../builders')

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
    return createUserChat({
        conversationsStore: opts.conversationsStore,
        clock: opts.clock,
        createId: opts.createId,
        titleGenerator: opts.titleGenerator,
        conversationFor$: id => of(createConversation({
            llm: opts.llm,
            tracer: opts.tracer,
            tools: opts.tools,
            history: opts.createHistory(id),
            initialMessages: opts.initialMessagesById[id] || [],
            id
        }))
    })
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
