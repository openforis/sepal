require('module-alias/register')
const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const websocket = require('koa-easy-ws')
const config = require('./config')
const {resolve} = require('./stream')
const environments = require('./environment')
const log = require('@sepal/log')('http')

const environment = process.env.ENVIRONMENT || 'main'

const app = new Koa()

app.use(async (ctx, next) => {
    const start = new Date()
    log.debug(`${ctx.method} ${ctx.url} started`)
    await next()
    const ms = new Date() - start
    log.debug(`${ctx.method} ${ctx.url} - ${ms}ms`)
})

app.use(bodyParser())
app.use(websocket())

app.use(resolve)
app.use(environments[environment].routes)
app.use(environments.test.routes)

const server = app.listen(config.port, () =>
    log.info(`Listening on port ${config.port}`)
)
server.setTimeout(10 * 60 * 1000)
