import {wsStream} from '#sepal/httpServer'

import {registerTaskRoutes} from './task/routes.js'
import {createTaskWs} from './task/ws.js'
import {sessionChanged$} from './workerSession/events.js'
import {registerSessionRoutes} from './workerSession/routes.js'
import {createSessionWs} from './workerSession/ws.js'

const createRoutes = ({sessionsApi, tasksApi} = {}) => router => {
    router.get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    if (sessionsApi) {
        registerSessionRoutes(router, sessionsApi)
    }
    if (tasksApi) {
        registerTaskRoutes(router, tasksApi)
    }
    return router
}

// Back-compat default: healthcheck only (used where no session component is wired yet).
const routes = createRoutes()

// createWsRoutes({taskManager, sessionsApi, sessionManager}) → the wsRoutes map for server.start.
// The gateway's uplink dials one url per module entry in modules/gateway/config/endpoints.js
// webSocketEndpoints (`worker/task` → /task/ws, `worker/session` → /session/ws).
// sessionManager powers the session ws's clientDown side effect (dissociate the client's apps).
const createWsRoutes = ({taskManager, sessionsApi, sessionManager}) => {
    const taskWs$ = createTaskWs({taskManager})
    const sessionWs$ = createSessionWs({sessionsApi, sessionChanged$, sessionManager})
    return {
        '/task/ws': wsStream(ctx => taskWs$(ctx.arg$)),
        '/session/ws': wsStream(ctx => sessionWs$(ctx.arg$))
    }
}

export {createRoutes, createWsRoutes, routes}
