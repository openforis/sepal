// Composition root. Builds and wires every chat collaborator, then hands
// the result to createServer. No domain logic lives here.

import Redis from 'ioredis'
import {of, timer} from 'rxjs'
import {v4 as uuid} from 'uuid'

import * as httpServer from '#sepal/httpServer'
import {stream} from '#sepal/httpServer'

import {createRedisChatStorage} from './chat/conversation/redisChatStorage.js'
import {createUserChats} from './chat/conversation/userChats.js'
import {createWsHandler} from './chat/conversation/wsHandler.js'
import {createDiagnostics} from './chat/diagnostics.js'
import {createGuiRequests} from './chat/guiRequests.js'
import {createLlm} from './chat/llm/index.js'
import {createOrchestratorToolRegistry} from './chat/orchestratorToolRegistry.js'
import {subscribeUsageRollups} from './chat/usageRollups.js'
import {createEventBus} from './eventBus.js'
import {subscribeLogListener} from './logListener.js'
import {createServer} from './server.js'

const GUI_REQUEST_TIMEOUT_MS = 30_000

function createApp({config}) {
    const clock = systemClock()
    const bus = createEventBus({clock, createId: uuid})
    const diagnostics = createDiagnostics({fullPayloads: config.fullTracePayloads})

    subscribeLogListener({bus})
    subscribeUsageRollups({bus})

    const llm = createLlm({
        baseURL: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
        provider: config.llmProvider,
        bus,
        clock,
        diagnostics
    })
    const guiRequests = createGuiRequests({clock, createId: uuid, timeoutMs: GUI_REQUEST_TIMEOUT_MS, bus})
    const tools = createOrchestratorToolRegistry({guiRequests, llm, bus, diagnostics})
    const chatStorage = createRedisChatStorage({
        redis: new Redis({host: config.redisHost}),
        ttlMs: config.conversationTtlMs
    })
    const userChats = createUserChats({
        chatStorage, llm, tools, bus, clock, createId: uuid, diagnostics
    })
    const wsHandler = createWsHandler({bus, userChatFor: userChats.chatFor, guiRequests})

    const routes = router => router.get('/healthcheck', stream(() => of({status: 'ok'})))

    return createServer({httpServer, bus, port: config.port, routes, wsHandler})
}

function systemClock() {
    return {
        now: () => Date.now(),
        nowIso: () => new Date().toISOString(),
        delay$: ms => timer(ms)
    }
}

export {createApp}
