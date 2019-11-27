require('module-alias/register')
const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const websocket = require('koa-easy-ws')
const logger = require('koa-pino-logger')
const config = require('./config')
const {resolve} = require('./stream')
const environments = require('./environment')
const log = require('@sepal/log')

const environment = process.env.ENVIRONMENT || 'main'

const app = new Koa()
app.silent = true

app.use(logger())
app.use(bodyParser())
app.use(websocket())
  
app.use(resolve)
app.use(environments[environment].routes)
app.use(environments.test.routes)

app.listen(config.port, () =>
    log.info(`Listening on port ${config.port}`)
)
