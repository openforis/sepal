const router = require('koa-router')()

const test1 = require('../jobs/test1')
const test2 = require('../jobs/test2')
const preview = require('../jobs/preview')
const tableColumns = require('../jobs/table/columns')
const tableColumnValues = require('../jobs/table/columnValues')
const tableQuery = require('../jobs/table/query')
const tableMap= require('../jobs/table/map')
router
    .get('/test1',
            ctx => ctx.stream$ = test1(ctx).submit$(1, 3000, 3000))
    .get('/test2',
            ctx => ctx.stream$ = test2(ctx).submit$(1, 3000, 3000))
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

