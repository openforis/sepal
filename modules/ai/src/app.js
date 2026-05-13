const {of, throwError} = require('rxjs')
const {v4: uuid} = require('uuid')
const httpServer = require('#sepal/httpServer')
const {stream} = require('#sepal/httpServer')
const log = require('#sepal/log').getLogger('ai')

const {createInMemoryConversationsStore} = require('./chat/io/conversationsStore')
const {createInMemoryHistory} = require('./chat/io/inMemoryHistory')
const {createOpenAI} = require('./chat/io/openai')
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

    bus.events$.subscribe(createLogListener({log: logViaLog4js}).onEvent)

    const llm = createOpenAI({
        baseURL: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
        bus
    })
    const tools = noTools()

    const userChats = new Map()
    const userChatFor = username => {
        if (!userChats.has(username)) {
            userChats.set(username, createUserChat({
                conversationsStore: createInMemoryConversationsStore(),
                clock,
                newConversation: () => createConversation({
                    llm, tracer, tools,
                    history: createInMemoryHistory(),
                    systemPrompt: config.systemPrompt,
                    id: uuid()
                })
            }))
        }
        return userChats.get(username)
    }

    const wsHandler = createWsHandler({bus, userChatFor})

    const routes = router => router.get('/healthcheck', stream(() => of({status: 'ok'})))

    return createServer({httpServer, tracer, port: config.port, routes, wsHandler})
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
