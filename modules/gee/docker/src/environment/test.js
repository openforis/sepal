const Router = require('koa-router')
const {wrapper} = require('../stream')

const test$ = require('@sepal/jobs/test')
const ws$ = require('@sepal/jobs/ws')

const router = Router()

router
    .get('/test/:min/:max', wrapper(ctx => test$(ctx)))
    .get('/ws', wrapper(ctx => ws$(ctx)))
        
module.exports = {
    routes: router.routes()
}
