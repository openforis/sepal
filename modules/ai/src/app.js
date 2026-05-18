const {of, timer} = require('rxjs')
const {v4: uuid} = require('uuid')
const Redis = require('ioredis')
const httpServer = require('#sepal/httpServer')
const {stream} = require('#sepal/httpServer')

const {createGuiRequests} = require('./chat/guiRequests')
const {createRedisChatStorage} = require('./chat/conversation/redisChatStorage')
const {createUserChats} = require('./chat/conversation/userChats')
const {createWsHandler} = require('./chat/conversation/wsHandler')
const {createOrchestratorToolRegistry} = require('./chat/orchestratorToolRegistry')
const {createLlm} = require('./chat/llm')
const {createEventBus} = require('./eventBus')
const {subscribeLogListener} = require('./logListener')
const {createTracer} = require('./tracer')
const {createServer} = require('./server')

const GUI_REQUEST_TIMEOUT_MS = 30_000

function createApp({config}) {
    const bus = createEventBus()
    const clock = systemClock()
    const tracer = createTracer({bus, clock, createId: uuid})

    subscribeLogListener({bus})

    const llm = createLlm({
        baseURL: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
        provider: config.llmProvider,
        bus
    })
    const guiRequests = createGuiRequests({clock, createId: uuid, timeoutMs: GUI_REQUEST_TIMEOUT_MS, bus})
    const tools = createOrchestratorToolRegistry({guiRequests, llm, tracer, bus})
    const chatStorage = createRedisChatStorage({
        redis: new Redis({host: config.redisHost}),
        ttlMs: config.conversationTtlMs
    })
    const userChats = createUserChats({
        chatStorage, llm, tools, tracer, bus, clock, createId: uuid
    })
    const wsHandler = createWsHandler({bus, userChatFor: userChats.chatFor, guiRequests})

    const routes = router => router.get('/healthcheck', stream(() => of({status: 'ok'})))

    return createServer({httpServer, tracer, port: config.port, routes, wsHandler})
}

function systemClock() {
    return {
        now: () => Date.now(),
        nowIso: () => new Date().toISOString(),
        delay$: ms => timer(ms)
    }
}

module.exports = {createApp}
