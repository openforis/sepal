const {stream} = require('#sepal/httpServer/stream')

const testHttpWorker$ = require('./http-worker')
const testHttpDirect$ = require('./http-direct')
const testWs$ = require('./ws')

module.exports = router =>
    router
        .get('/test/http/worker/:min/:max/:errorProbability', stream(ctx => testHttpWorker$(ctx)))
        .get('/test/http/direct/:min/:max/:errorProbability', stream(ctx => testHttpDirect$(ctx)))
        .get('/test/ws/:name', stream(ctx => testWs$(ctx)))
