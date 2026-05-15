const {map, of, timer} = require('rxjs')
const {v4: uuid} = require('uuid')
const Redis = require('ioredis')
const httpServer = require('#sepal/httpServer')
const {stream} = require('#sepal/httpServer')
const log = require('#sepal/log').getLogger('ai')

const {createGuiRequests} = require('./chat/io/guiRequests')
const {createRedisConversationsStore} = require('./chat/io/redisConversationsStore')
const {createRedisHistory} = require('./chat/io/redisHistory')
const {createWsHandler} = require('./chat/io/wsHandler')
const {createLlm} = require('./chat/llm')
const {mainSystemPrompt} = require('./chat/llmText/prompts')
const {createConversation} = require('./chat/sendMessage/conversation')
const {productTools} = require('./chat/sendMessage/productTools')
const {createTitleGenerator} = require('./chat/sendMessage/titleGenerator')
const {createToolRegistry} = require('./chat/sendMessage/tools')
const {createUserChat} = require('./chat/sendMessage/userChat')
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

    const llm = createLlm({
        baseURL: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
        provider: config.llmProvider,
        bus
    })
    const guiRequests = createGuiRequests({clock, createId: uuid, timeoutMs: GUI_REQUEST_TIMEOUT_MS, bus})

    const tools = conversationTools({config, guiRequests, llm, tracer, bus})

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

function conversationTools({config, guiRequests, llm, tracer, bus}) {
    const productToolList = productTools({guiRequests})
    // Specialists may call only the inner product-tool registry. The outer
    // registry is the main conversation surface and includes specialists.
    const innerTools = createToolRegistry({tools: productToolList, bus})
    const specialistToolList = specialistTools({llm, tracer, bus, innerTools})
    return createToolRegistry({
        tools: [...productToolList, ...specialistToolList, ...enabledSmokeTools(config, guiRequests)],
        bus
    })
}

function enabledSmokeTools(config, guiRequests) {
    if (config.enableAiTransportSmokeTools) {
        // ask_gui_echo is held back until a matching GUI echo action exists.
        return transportSmokeTestTools(guiRequests).filter(tool => tool.name !== 'ask_gui_echo')
    } else {
        return []
    }
}

// Transport smoke-test tools: one direct tool and one GUI-backed tool, enough
// to exercise the full tool round trip. Dev/test only.
function transportSmokeTestTools(guiRequests) {
    const textParameter = {
        type: 'object',
        properties: {text: {type: 'string'}},
        required: ['text'],
        additionalProperties: false
    }
    return [
        {
            name: 'echo',
            description: 'Echo input text back.',
            parameters: textParameter,
            invoke$: input => of({echoed: input.text})
        },
        {
            name: 'ask_gui_echo',
            description: 'Ask the GUI to echo input text.',
            parameters: textParameter,
            invoke$: (input, context) => guiRequests.request$({
                channel: context.channel,
                clientId: context.clientId,
                subscriptionId: context.subscriptionId,
                action: 'echo',
                params: input
            })
        }
    ]
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
