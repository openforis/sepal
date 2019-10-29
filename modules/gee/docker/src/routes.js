const router = require('koa-router')()

const test = require('./jobs/test')
const preview = require('./jobs/preview')

router
    .get('/test', ctx =>
        ctx.stream$ = test(ctx).submit(123, 'abc')
    )
    .post('/preview', ctx => {
        ctx.stream$ = preview(ctx).submit(15)
    })
    .get('*', ctx => {
        ctx.body = {status: 'OK'}
    })

module.exports = router.routes()
