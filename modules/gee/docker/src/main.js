const Koa = require('koa')
const logger = require('koa-logger')
// const pino = require('koa-pino-logger')
const config = require('./config')
const stream = require('./middleware/stream')
const routes = require('./routes')
const log = require('./log')

const app = new Koa()

app.use(logger())
// app.use(pino())

app.use(stream)
app.use(routes)

app.listen(config.port, () =>
    log.info(`Listening on port ${config.port}`)
)
