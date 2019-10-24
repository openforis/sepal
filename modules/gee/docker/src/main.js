const Koa = require('koa')
const logger = require('koa-logger')
const pino = require('koa-pino-logger')
const router = require('koa-router')()
const config = require('./config')
const job = require('./job')
// const gee = require('./gee')
const stream = require('./middleware/stream')
const log = require('./log')
// const workers = require('./workers')

const app = new Koa()

app.use(logger())
// app.use(pino())
app.use(stream)

router
    .get('/test', ctx =>
        ctx.stream$ = job.submit({relativePath: 'test', args: [123]})
    )
    .post('/preview', ctx => {
        // ctx.stream$ = workers(ctx).preview(123)
        // ctx.stream$ = gee.submit(ctx.req, 'preview', [123])
        const sepalUser = JSON.parse(ctx.request.headers['sepal-user'])
        const serviceAccountCredentials = config.serviceAccountCredentials
        const credentials = {
            sepalUser,
            serviceAccountCredentials
        }
        ctx.stream$ = job.submit({relativePath: 'preview', args: [123], credentials})
    })
    .get('*', ctx => {
        ctx.body = {status: 'OK'}
    })

app.use(router.routes())

app.listen(config.port, () =>
    log.info(`Listening on port ${config.port}`)
)
