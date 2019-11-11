const router = require('koa-router')()

const test1 = require('../jobs/test1')
const test2 = require('../jobs/test2')
const preview = require('../jobs/preview')
const tableColumns = require('../jobs/tableColumns')
const tableColumnValues = require('../jobs/tableColumnValues')
router
    .get('/test1', ctx =>
        ctx.stream$ = test1(ctx).submit$(1, 3000, 3000)
    )
    .get('/test2', ctx =>
        ctx.stream$ = test2(ctx).submit$(1, 3000, 3000)
    )
    .post('/preview', ctx => {
        ctx.stream$ = preview(ctx).submit$(ctx.request.body)
    })
    .get('/table/columns', ctx => {
        ctx.stream$ = tableColumns(ctx).submit$(ctx.request.query)
    })
    .get('/table/columnValues', ctx => {
        ctx.stream$ = tableColumnValues(ctx).submit$(ctx.request.query)
    })

// .get('*', ctx => {
//     ctx.body = {status: 'OK'}
// })

module.exports = {
    routes: router.routes(),
    scheduled: []
}

