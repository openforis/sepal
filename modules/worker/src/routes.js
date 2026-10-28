import {wsStream} from '#sepal/httpServer'

import {sessionChanged$} from './workerSession/events.js'
import {registerSessionRoutes} from './workerSession/routes.js'
import {createSessionWs} from './workerSession/ws.js'

const createRoutes = ({sessionsApi} = {}) => router => {
    router.get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    if (sessionsApi) {
        registerSessionRoutes(router, sessionsApi)
    }
    return router
}

// createWsRoutes({sessionsApi, sessionManager}) → the wsRoutes map for server.start.
// The gateway's uplink dials one url per module entry in modules/gateway/config/endpoints.js
// webSocketEndpoints (`worker/session` → /session/ws).
// sessionManager powers the session ws's clientDown side effect (dissociate the client's apps).
const createWsRoutes = ({sessionsApi, sessionManager}) => {
    const sessionWs$ = createSessionWs({sessionsApi, sessionChanged$, sessionManager})
    return {
        '/session/ws': wsStream(ctx => sessionWs$(ctx.arg$))
    }
}

export {createRoutes, createWsRoutes}
