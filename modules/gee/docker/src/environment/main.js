const router = require('koa-router')()

const test = require('../jobs/test')
const preview = require('../jobs/preview')

router
    .get('/test', ctx =>
        ctx.stream$ = test(ctx).submit(100)
    )
    .post('/preview', ctx => {
        ctx.stream$ = preview(ctx).submit(ctx.request.body)
    })
    .get('*', ctx => {
        ctx.body = {status: 'OK'}
    })

module.exports = {
    routes: router.routes(),
    scheduled: []
}

