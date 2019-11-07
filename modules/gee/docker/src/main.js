const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const logger = require('koa-logger')
// const pino = require('koa-pino-logger')
const config = require('./config')
const stream = require('./stream')
const environments = require('./environment')
const log = require('./log')

const environment = process.env.ENVIRONMENT || 'main'

const app = new Koa()

app.use(logger())
// app.use(pino())
app.use(bodyParser())

app.use(stream)
app.use(environments[environment].routes)

app.listen(config.port, () =>
    log.info(`Listening on port ${config.port}`)
)
