const Router = require('koa-router')

const test1$ = require('@sepal/jobs/test1')
const test2$ = require('@sepal/jobs/test2')
const sceneAreas$ = require('@sepal/jobs/image/sceneAreas')
const preview$ = require('@sepal/jobs/image/preview')
const tableColumns$ = require('@sepal/jobs/table/columns')
const tableColumnValues$ = require('@sepal/jobs/table/columnValues')
const tableQuery$ = require('@sepal/jobs/table/query')
const tableMap$ = require('@sepal/jobs/table/map')

const router = Router()

router
    .get('/test1',
        ctx => ctx.stream$ = test1$(ctx))
    .get('/test2',
        ctx => ctx.stream$ = test2$(ctx))

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
