const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const websocket = require('koa-easy-ws')
const Router = require('@koa/router')
const log = require('#sepal/log').getLogger('http')
const {resolveStream, stream} = require('./httpServer/stream')
const {default: ShortUniqueId} = require('short-unique-id')
const uid = new ShortUniqueId()

const requestTag = requestId => `<${requestId}>`

const requestId = async (ctx, next) => {
    const requestId = uid()
    ctx.requestId = requestId
    ctx.requestTag = requestTag(requestId)
    await next()
}

const requestLog = async (ctx, next) => {
    const start = new Date()
    log.debug(`${ctx.requestTag} ${ctx.method} ${ctx.url} - started`)
    await next()
    const ms = new Date() - start
    log.info(`${ctx.requestTag} ${ctx.method} ${ctx.url} - ${ms}ms`)
}

const start = async ({port, routes, timeout = 10 * 60 * 1000}) =>
    new Promise(resolve => {
        const app = new Koa()
        const router = Router()
        app.use(requestId)
        app.use(requestLog)
        app.use(bodyParser({limit: '100mb', jsonLimit: '100mb', formLimit: '100mb'}))
        app.use(websocket())
        app.use(resolveStream)
        app.use(routes(router).routes())
        app.use(router.allowedMethods())
        app.listen(port, resolve).setTimeout(timeout)
    }) .then(
        () => log.info(`HTTP server started on port ${port}`)
    ) .catch(
        error => {
            log.error(`Cannot start HTTP server on port ${port}: ${error}`)
            throw error
        }
    )

module.exports = {start, stream}
