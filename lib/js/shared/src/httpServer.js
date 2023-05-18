const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const websocket = require('koa-easy-ws')
const Router = require('@koa/router')
const log = require('#sepal/log').getLogger('http')
const {resolveStream, stream} = require('./httpServer/stream')
const {default: ShortUniqueId} = require('short-unique-id')
const uid = new ShortUniqueId()
const {koaMiddleware: prometheusMiddleware} = require('prometheus-api-metrics')
// const {getWorkerMetrics$} = require('#sepal/metrics')
const testRoutes = require('./test/routes')

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
    const UNKNOWN = '?'
    try {
        const sepalUser = JSON.parse(ctx.req.headers['sepal-user'])
        return sepalUser ? sepalUser.username : UNKNOWN
    } catch (error) {
        return UNKNOWN
    }
}

const requestId = () =>
    async (ctx, next) => {
        const requestId = uid()
        ctx.requestId = requestId
        ctx.requestTag = requestTag(getUsername(ctx), requestId)
        await next()
    }

const requestLog = ({excludePaths = []}) =>
    async (ctx, next) => {
        if (excludePaths.includes(ctx.path)) {
            await next()
        } else {
            const start = new Date()
            log.isDebug() && log.debug(`${ctx.requestTag} ${ctx.method} ${ctx.url} - started, ${ctx.request.length || 0}b`)
            await next()
            const ms = new Date() - start
            log.isInfo() && log.info(`${ctx.requestTag} ${ctx.method} ${ctx.url} - ${ctx.response.status}, ${ms}ms, ${ctx.request.length || 0}b → ${ctx.response.length || 0}b`)
        }
    }

const start = async ({port, routes, timeout = 10 * 60 * 1000}) =>
    new Promise(resolve => {
        const router = Router()
        // router.get('/metrics/workers', stream(ctx => getWorkerMetrics$(ctx)))
        testRoutes(router)
        
        // apply custom routes
        routes && routes(router)

        const app = new Koa()
        // app.on('error', (err, ctx) => {
        //     log.error('Server error', err, ctx)
        // })

        app.use(errorHandler())
        app.use(prometheusMiddleware())
        app.use(requestId())
        // app.use(requestLog({excludePaths: ['/metrics', '/metrics/workers']}))
        app.use(requestLog({excludePaths: ['/metrics']}))
        app.use(bodyParser({limit: '100mb', jsonLimit: '100mb', formLimit: '100mb'}))
        app.use(websocket())
        app.use(resolveStream())
        app.use(router.routes())
        app.use(router.allowedMethods())
        app.listen(port, resolve).setTimeout(timeout)
    }) .then(
        () => log.info(`HTTP server started on port ${port}`)
    ).catch(
        error => {
            log.error(`Cannot start HTTP server on port ${port}: ${error}`)
            throw error
        }
    )

module.exports = {start, stream}
