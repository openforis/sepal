const Router = require('koa-router')

const test1 = require('@sepal/jobs/test1')
const test2 = require('@sepal/jobs/test2')
const preview = require('@sepal/jobs/image/preview')
const tableColumns = require('@sepal/jobs/table/columns')
const tableColumnValues = require('@sepal/jobs/table/columnValues')
const tableQuery = require('@sepal/jobs/table/query')
const tableMap = require('@sepal/jobs/table/map')

const router = Router()

router
    .get('/test1',
        ctx => ctx.stream$ = test1(ctx).submit$(1, 3000, 3000))
    .get('/test2',
        ctx => ctx.stream$ = test2(ctx).submit$(1, 3000, 3000))

router
    .post('/preview',
        ctx => ctx.stream$ = preview(ctx).submit$(ctx.request.body))
    .get('/table/columns',
        ctx => ctx.stream$ = tableColumns(ctx).submit$(ctx.request.query))
    .get('/table/columnValues',
        ctx => ctx.stream$ = tableColumnValues(ctx).submit$(ctx.request.query))
    .post('/table/query',
        ctx => ctx.stream$ = tableQuery(ctx).submit$(ctx.request.body))
    .get('/table/map',
        ctx => ctx.stream$ = tableMap(ctx).submit$(ctx.request.query))

module.exports = {
    routes: router.routes(),
    scheduled: []
}
