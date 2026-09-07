import Router from '@koa/router'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import websocket from 'koa-easy-ws'
import {createRequire} from 'module'
import ShortUniqueId from 'short-unique-id'
import {WebSocketServer} from 'ws'

import {getLogger} from '#sepal/log'

import {resolveStream, stream, wsStream} from './httpServer/stream.js'
// const {getWorkerMetrics$} = require('#sepal/metrics')
import testRoutes from './test/routes.js'

const require = createRequire(import.meta.url)

const DEFAULT_TIMEOUT = 10 * 60 * 1000

const log = getLogger('http/server')
const uid = new ShortUniqueId()

const requestTag = (username, requestId) => `<${username}:${requestId}>`

const errorHandler = () =>
    async (ctx, next) => {
        try {
            await next()
        } catch (err) {
            err.status = err.statusCode || err.status || 500
            log.debug(err)
            throw err
        }
    }

const getUsername = ctx => {
    const UNKNOWN = '[ANON]'
    try {
        const sepalUser = JSON.parse(ctx.req.headers['sepal-user'])
        return sepalUser ? sepalUser.username : UNKNOWN
    } catch (_error) {
        return UNKNOWN
    }
}

const requestId = () =>
    async (ctx, next) => {
        const requestId = uid.rnd()
        const username = getUsername(ctx)
        ctx.requestId = requestId
        ctx.username = username
        ctx.requestTag = requestTag(username, requestId)
        await next()
    }

const requestLog = ({excludePaths = []}) =>
    async (ctx, next) => {
        if (excludePaths.includes(ctx.path)) {
            await next()
        } else {
            const t0 = Date.now()
            log.isDebug() && log.debug(`${ctx.requestTag} ${ctx.method} ${ctx.url} - started, ${ctx.request.length || 0}b`)
            await next()
            const elapsedMilliseconds = Date.now() - t0
            log.isInfo() && log.info(`${ctx.requestTag} ${ctx.method} ${ctx.url} - ${ctx.response.status}, ${elapsedMilliseconds}ms, ${ctx.request.length || 0}b → ${ctx.cancelled ? 'cancelled' : `${ctx.response.length || 0}b`}`)
        }
    }

// prometheus-api-metrics inspects the CommonJS module.parent chain while loading, which only resolves
// under the real ESM loader. Keeping the load inside the default confines that constraint to callers
// that want the default; one supplying its own middleware never triggers it.
const createPrometheusMiddleware = () => require('prometheus-api-metrics').koaMiddleware()

const handleWebSocketRoutes = (server, wsRoutes) => {
    const wss = new WebSocketServer({noServer: true})
    server.on('upgrade', (req, socket, head) => {
        const requestPath = new URL(req.url, 'http://localhost').pathname
        const handler = wsRoutes[requestPath]
        if (handler) {
            wss.handleUpgrade(req, socket, head, ws => {
                // wss.emit('connection', ws, req)
                handler(ws)
            })
        }
    })
}

const start = async ({
    port,
    routes,
    wsRoutes,
    timeout = DEFAULT_TIMEOUT,
    metricsMiddleware = createPrometheusMiddleware()
}) => {
    // const wss = new WebSocketServer({noServer: true})
    return new Promise(resolve => {
        const router = new Router()
        // router.get('/metrics/workers', stream(ctx => getWorkerMetrics$(ctx)))
        testRoutes(router)
        
        // apply custom routes
        routes && routes(router)

        const app = new Koa()
        // app.on('error', (err, ctx) => {
        //     log.error('Server error', err, ctx)
        // })

        app.use(errorHandler())
        app.use(metricsMiddleware)
        app.use(requestId())
        // app.use(requestLog({excludePaths: ['/metrics', '/metrics/workers']}))
        app.use(requestLog({excludePaths: ['/metrics']}))
        app.use(bodyParser({limit: '100mb', jsonLimit: '100mb', formLimit: '100mb'}))
        app.use(websocket())
        app.use(resolveStream())
        app.use(router.routes())
        app.use(router.allowedMethods())

        const server = app.listen(port, () => resolve(server)).setTimeout(timeout)

        if (wsRoutes) {
            handleWebSocketRoutes(server, wsRoutes)
        }
    }).then(
        server => {
            log.info(`HTTP server started on port ${server.address().port}`)
            return server
        }
    ).catch(
        error => {
            log.error(`Cannot start HTTP server on port ${port}: ${error}`)
            throw error
        }
    )
}

export {start, stream, wsStream}
