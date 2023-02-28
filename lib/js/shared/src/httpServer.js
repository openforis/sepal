const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const websocket = require('koa-easy-ws')
const Router = require('@koa/router')
const log = require('#sepal/log').getLogger('http')
const {resolveStream, stream} = require('./httpServer/stream')
const {default: ShortUniqueId} = require('short-unique-id')
const uid = new ShortUniqueId()
const {koaMiddleware: prometheusMiddleware} = require('prometheus-api-metrics')
const {initMetrics, getMetrics$} = require('#sepal/metrics')

initMetrics()

const requestTag = requestId => `<${requestId}>`

const errorHandlerMiddleware = () =>
    async (ctx, next) => {
        try {
            await next()
        } catch (err) {
            err.status = err.statusCode || err.status || 500
            log.debug(err)
            throw err
        }
    }

const requestId = () =>
    async (ctx, next) => {
        const requestId = uid()
        ctx.requestId = requestId
        ctx.requestTag = requestTag(requestId)
        await next()
    }

const requestLog = ({excludePaths = []}) =>
    async (ctx, next) => {
        if (excludePaths.includes(ctx.path)) {
            await next()
        } else {
            const start = new Date()
            log.debug(`${ctx.requestTag} ${ctx.method} ${ctx.url} - started, content-length: ${ctx.request.headers['content-length']}`)
            await next()
            const ms = new Date() - start
            log.info(`${ctx.requestTag} ${ctx.method} ${ctx.url} - ${ms}ms`)
        }
    }

const start = async ({port, routes, timeout = 10 * 60 * 1000}) =>
    new Promise(resolve => {
        const router = Router()
        router.get('/metrics/system', stream(ctx => getMetrics$(ctx)))
        routes && routes(router)

        const app = new Koa()
        app.use(errorHandlerMiddleware())
        app.use(prometheusMiddleware({metricsPath: '/metrics/http', excludeRoutes: ['/metrics/system']}))
        app.use(requestId())
        app.use(requestLog({excludePaths: ['/metrics/system', '/metrics/http']}))
        app.use(bodyParser({limit: '100mb', jsonLimit: '100mb', formLimit: '100mb'}))
        app.use(websocket())
        app.use(resolveStream)
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
