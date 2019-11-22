const Router = require('koa-router')

const test$ = require('@sepal/jobs/test')
const sceneAreas$ = require('@sepal/jobs/image/sceneAreas')
const preview$ = require('@sepal/jobs/image/preview')
const tableColumns$ = require('@sepal/jobs/table/columns')
const tableColumnValues$ = require('@sepal/jobs/table/columnValues')
const tableQuery$ = require('@sepal/jobs/table/query')
const tableMap$ = require('@sepal/jobs/table/map')

const router = Router()

router
    .get('/test',
        ctx => ctx.stream$ = test$(ctx))

router
    .post('/sceneareas',
        ctx => ctx.stream$ = sceneAreas$(ctx))
    .post('/preview',
        ctx => ctx.stream$ = preview$(ctx))
    .get('/table/columns',
        ctx => ctx.stream$ = tableColumns$(ctx))
    .get('/table/columnValues',
        ctx => ctx.stream$ = tableColumnValues$(ctx))
    .post('/table/query',
        ctx => ctx.stream$ = tableQuery$(ctx))
    .get('/table/map',
        ctx => ctx.stream$ = tableMap$(ctx))

module.exports = {
    routes: router.routes(),
    scheduled: []
}
