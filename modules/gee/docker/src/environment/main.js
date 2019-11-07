const router = require('koa-router')()

const test = require('../jobs/test')
const preview = require('../jobs/preview')
const tableColumns = require('../jobs/tableColumns')
const tableColumnValues = require('../jobs/tableColumnValues')
router
    .get('/test', ctx =>
        ctx.stream$ = test(ctx).submit$(1, 0)
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

