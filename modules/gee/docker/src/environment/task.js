const router = require('koa-router')()
const log = require('@sepal/log')

router.get('/healthCheck', ctx =>
    ctx.body = {status: 'OK'}
)

router.get('/status', ctx => {
    const {task} = ctx.request.query
    ctx.body = {
        status: 'ACTIVE',
        progress: '{"defaultMessage":"Completed!","messageKey":"tasks.status.completed","messageArgs":{}}'
    }
})

router.post('/submit', ctx => {
    const params = ctx.request.body
    ctx.response.status = 204
})

router.post('/cancel', ctx => {
    const {task} = ctx.request.query
    ctx.response.status = 204
})

router.get('*', ctx => {
    log.debug(ctx.request)
    ctx.body = {
        status: 'OK'
    }
})
router.post('*', ctx => {
    log.debug(ctx.request, ctx.request.body)
    ctx.body = {
        status: 'OK'
    }
})

const scheduled = []

module.exports = {
    routes: router.routes(),
    scheduled
}
