const {Subject, of} = require('rxjs')
const {createWsHandler} = require('#mcp/chat/conversation/wsHandler')
const {createConversation} = require('#mcp/chat/conversation/conversation')
const {createConversations} = require('#mcp/chat/conversation/conversations')
const {createTabContexts} = require('#mcp/chat/conversation/tabContexts')
const {createTurnFlow} = require('#mcp/chat/conversation/turnFlow')
const {createUserChat} = require('#mcp/chat/conversation/userChat')
const {createInMemoryConversationsStore} = require('./inMemoryConversationsStore')
const {aFakeBus, aFakeHistory, aFakeLlm, aFakeTools, aFakeTitleGenerator} = require('../builders')

const alice = {user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'}
const aliceTargeted = {username: 'alice', clientId: 'c1', subscriptionId: 's1'}
const aliceLabel = 'c1:s1 (alice)'

const FIXED_TIME = 1700000000000
const ISO_FIXED = new Date(FIXED_TIME).toISOString()
const META = {title: '', createdAt: ISO_FIXED, updatedAt: ISO_FIXED}

function aNoopBus() {
    return {publish: () => {}}
}

const aRecordingBus = aFakeBus

function aNoopGuiRequests() {
    return {respond: () => {}, cancelForSubscription: () => {}}
}

function aPassThroughTracer() {
    return {span$: (_name, _attrs, work$) => work$}
}

function aHandler({
    replies = [{text: 'Hi there!'}],
    conversationIds = ['conv-1'],
    bus = aNoopBus(),
    guiRequests = aNoopGuiRequests(),
    conversationsStore = createInMemoryConversationsStore()
} = {}) {
    let i = 0
    const createId = () => conversationIds[Math.min(i++, conversationIds.length - 1)]
    const llm = aFakeLlm({replies})
    const tracer = aPassThroughTracer()
    const tools = aFakeTools()
    const clock = {
        now: () => FIXED_TIME,
        nowIso: () => ISO_FIXED
    }
    const cache = new Map()
    const userChatFor = username => {
        if (!cache.has(username)) {
            const conversations = createConversations({
                conversationsStore,
                conversationFor$: id => of(createConversation({
                    llm, tracer, tools,
                    history: aFakeHistory(),
                    id
                })),
                createId,
                clock
            })
            const tabContexts = createTabContexts()
            const turnFlow = createTurnFlow({
                conversations, tabContexts,
                titleGenerator: aFakeTitleGenerator(),
                clock
            })
            cache.set(username, createUserChat({conversations, tabContexts, turnFlow, tracer, bus: aNoopBus()}))
        }
        return cache.get(username)
    }
    return createWsHandler({bus, userChatFor, guiRequests})
}

function captureSent(onConnection) {
    const arg$ = new Subject()
    const sent = []
    onConnection({arg$}).subscribe(message => sent.push(message))
    return {arg$, sent}
}

function subscribeHandler(handler) {
    const arg$ = new Subject()
    handler({arg$}).subscribe()
    return arg$
}

module.exports = {
    alice, aliceTargeted, aliceLabel,
    ISO_FIXED, META,
    aHandler, captureSent, subscribeHandler,
    aNoopBus, aRecordingBus, aNoopGuiRequests, aPassThroughTracer,
    createInMemoryConversationsStore
}
