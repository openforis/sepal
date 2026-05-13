const {map, of, throwError} = require('rxjs')
const {v4: uuid} = require('uuid')
const Redis = require('ioredis')
const httpServer = require('#sepal/httpServer')
const {stream} = require('#sepal/httpServer')
const log = require('#sepal/log').getLogger('ai')

const {createOpenAI} = require('./chat/io/openai')
const {createRedisConversationsStore} = require('./chat/io/redisConversationsStore')
const {createRedisHistory} = require('./chat/io/redisHistory')
const {createWsHandler} = require('./chat/io/wsHandler')
const {createConversation} = require('./chat/sendMessage/conversation')
const {createUserChat} = require('./chat/sendMessage/userChat')
const {createEventBus} = require('./eventBus')
const {createLogListener} = require('./logListener')
const {createTracer} = require('./tracer')
const {createServer} = require('./server')

function createApp({config}) {
    const bus = createEventBus()
    const clock = systemClock()
    const tracer = createTracer({bus, clock, createId: uuid})
    const redis = new Redis({host: config.redisHost})
    const ttlMs = config.conversationTtlMs

    bus.events$.subscribe(createLogListener({log: logViaLog4js}).onEvent)

    const llm = createOpenAI({
        baseURL: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
        bus
    })
    const tools = noTools()

    const userChats = new Map()
    const wsHandler = createWsHandler({bus, userChatFor})

    const routes = router => router.get('/healthcheck', stream(() => of({status: 'ok'})))

    return createServer({httpServer, tracer, port: config.port, routes, wsHandler})

    function userChatFor(username) {
        if (!userChats.has(username)) userChats.set(username, buildUserChat(username))
        return userChats.get(username)
    }

    function buildUserChat(username) {
        return createUserChat({
            conversationsStore: createRedisConversationsStore({redis, username, ttlMs}),
            clock,
            createId: uuid,
            conversationFor$: id => buildConversation$(username, id)
        })
    }

    function buildConversation$(username, id) {
        const history = createRedisHistory({redis, username, conversationId: id, ttlMs})
        return history.load$().pipe(
            map(initialMessages => createConversation({
                llm, tracer, tools, history,
                initialMessages,
                systemPrompt: config.systemPrompt,
                id
            }))
        )
    }
}

function systemClock() {
    return {now: () => Date.now()}
}

function noTools() {
    return {invoke$: name => throwError(() => new Error(`Tools not configured (asked for ${name})`))}
}

function logViaLog4js(level, line) {
    log[level](line)
}

module.exports = {createApp}
