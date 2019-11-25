const Router = require('koa-router')
const {wrapper} = require('../stream')

const sceneAreas$ = require('@sepal/jobs/image/sceneAreas')
const preview$ = require('@sepal/jobs/image/preview')
const tableColumns$ = require('@sepal/jobs/table/columns')
const tableColumnValues$ = require('@sepal/jobs/table/columnValues')
const tableQuery$ = require('@sepal/jobs/table/query')
const tableMap$ = require('@sepal/jobs/table/map')

const router = Router()

router
    .post('/sceneareas', wrapper(ctx => sceneAreas$(ctx)))
    .post('/preview', wrapper(ctx => preview$(ctx)))
    .get('/table/columns', wrapper(ctx => tableColumns$(ctx)))
    .get('/table/columnValues', wrapper(ctx => tableColumnValues$(ctx)))
    .post('/table/query', wrapper(ctx => tableQuery$(ctx)))
    .get('/table/map', wrapper(ctx => tableMap$(ctx)))

module.exports = {
    routes: router.routes(),
    scheduled: []
}
