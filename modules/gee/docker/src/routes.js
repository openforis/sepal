const {stream} = require('sepal/httpServer')

const check$ = require('root/jobs/ee/check')

module.exports = router =>
    router
        .get('/', stream(ctx => check$(ctx)))
        .get('/static', stream(ctx => check$(ctx)))
        .get('/resource', stream(ctx => check$(ctx)))
        .get('/healthcheck', stream(ctx => check$(ctx)))
