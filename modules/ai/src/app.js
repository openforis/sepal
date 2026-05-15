const {map, of, timer} = require('rxjs')
const {v4: uuid} = require('uuid')
const Redis = require('ioredis')
const httpServer = require('#sepal/httpServer')
const {stream} = require('#sepal/httpServer')
const log = require('#sepal/log').getLogger('ai')

const {createGuiRequests} = require('./chat/tools/guiRequests')
const {createRedisConversationsStore} = require('./chat/conversation/redisConversationsStore')
const {createRedisHistory} = require('./chat/conversation/redisHistory')
const {createWsHandler} = require('./chat/conversation/wsHandler')
const {createLlm} = require('./chat/llm')
const {mainSystemPrompt} = require('./chat/llmText/prompts')
const {createConversation} = require('./chat/conversation/conversation')
const {productTools, specialistInnerTools} = require('./chat/tools/productTools')
const {createTitleGenerator} = require('./chat/conversation/titleGenerator')
const {createToolRegistry} = require('./chat/tools/registry')
const {createUserChat} = require('./chat/conversation/userChat')
const {specialistTools} = require('./chat/specialists/specialistTools')
const {createEventBus} = require('./eventBus')
const {createLogListener} = require('./logListener')
const {createTracer} = require('./tracer')
const {createServer} = require('./server')

const GUI_REQUEST_TIMEOUT_MS = 30_000

function createApp({config}) {
    const bus = createEventBus()
    const clock = systemClock()
    const tracer = createTracer({bus, clock, createId: uuid})
    const redis = new Redis({host: config.redisHost})
    const ttlMs = config.conversationTtlMs
    // Production loads the project prompt asset; tests/smoke runs may pass
    // config.systemPrompt directly to swap in a short prompt.
    const systemPrompt = config.systemPrompt ?? mainSystemPrompt()

    subscribeLogListener(bus)

    const llm = createLlm({
        baseURL: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
        provider: config.llmProvider,
        bus
    })
    const guiRequests = createGuiRequests({clock, createId: uuid, timeoutMs: GUI_REQUEST_TIMEOUT_MS, bus})

    const tools = buildConversationTools({guiRequests, llm, tracer, bus})

    const userChats = new Map()
    const wsHandler = createWsHandler({bus, userChatFor, guiRequests})

    const routes = router => router.get('/healthcheck', stream(() => of({status: 'ok'})))

    return createServer({httpServer, tracer, port: config.port, routes, wsHandler})

    function userChatFor(username) {
        if (!userChats.has(username)) userChats.set(username, buildUserChat(username))
        return userChats.get(username)
    }

    function buildUserChat(username) {
        const conversationsStore = createRedisConversationsStore({redis, username, ttlMs})
        const titleGenerator = createTitleGenerator({llm, conversationsStore, tracer, bus})
        return createUserChat({
            conversationsStore,
            clock,
            createId: uuid,
            titleGenerator,
            conversationFor$: id => buildConversation$(username, id)
        })
    }

    function buildConversation$(username, id) {
        const history = createRedisHistory({redis, username, conversationId: id, ttlMs})
        return history.load$().pipe(
            map(initialMessages => createConversation({
                llm, tracer, tools, history,
                initialMessages,
                systemPrompt,
                id,
                bus
            }))
        )
    }
}

function systemClock() {
    return {
        now: () => Date.now(),
        nowIso: () => new Date().toISOString(),
        delay$: ms => timer(ms)
    }
}

function buildConversationTools({guiRequests, llm, tracer, bus}) {
    // Inner registry holds specialist-visible tools (recipe_load lives here).
    // The outer registry is the orchestrator's surface and substitutes
    // describe_recipe for raw recipe_load.
    const innerTools = createToolRegistry({tools: specialistInnerTools({guiRequests}), bus})
    const productToolList = productTools({guiRequests, llm, tracer, innerTools})
    const specialistToolList = specialistTools({llm, tracer, innerTools})
    return createToolRegistry({
        tools: [...productToolList, ...specialistToolList],
        bus
    })
}

function subscribeLogListener(bus) {
    const logListener = createLogListener({log: logViaLog4js})
    bus.events$.subscribe({
        next: event => {
            try {
                logListener.onEvent(event)
            } catch (error) {
                log.error('Log listener threw while handling event:', error)
            }
        },
        error: error => fatal('Event bus errored', error),
        complete: () => fatal('Event bus completed unexpectedly')
    })
}

function logViaLog4js(level, line) {
    log[level](line)
}

function fatal(reason, error) {
    log.error(`FATAL: ${reason}`, error)
    // eslint-disable-next-line no-console
    console.error(`FATAL: ${reason}`, error)
    process.exit(1)
}

module.exports = {createApp}
