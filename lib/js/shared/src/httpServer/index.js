const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const websocket = require('koa-easy-ws')
const Router = require('koa-router')
const log = require('sepal/log').getLogger('http')
const {resolve, stream} = require('./stream')
const {default: ShortUniqueId} = require('short-unique-id')
const uid = new ShortUniqueId()

const requestTag = async (ctx, next) => {
    ctx.requestTag = `<${uid()}>`
    await next()
}

const requestLog = async (ctx, next) => {
    const start = new Date()
    log.debug(`${ctx.requestTag} ${ctx.method} ${ctx.url} - started`)
    await next()
    const ms = new Date() - start
    log.info(`${ctx.requestTag} ${ctx.method} ${ctx.url} - ${ms}ms`)
}

const router = Router()

const start = ({port, routes, timeout = 10 * 60 * 1000}) => {
    const app = new Koa()
    app.use(requestTag)
    app.use(requestLog)
    app.use(bodyParser())
    app.use(websocket())
    app.use(resolve)
    app.use(routes(router).routes())

    const server = app.listen(port, () =>
        log.info(`HTTP server started on port ${port}`)
    )
    server.setTimeout(timeout)

}

module.exports = {start, stream}
