import {stream} from '#sepal/httpServer/stream'

import testHttpDirect$ from './http-direct.js'
import testHttpWorker$ from './http-worker.js'
import testWs$ from './ws.js'

export default router =>
    router
        .get('/test/http/worker/:workerMin/:workerMax/:workerErrorProbability/:finalizeMin/:finalizeMax/:finalizeErrorProbability', stream(ctx => testHttpWorker$(ctx)))
        .get('/test/http/worker/:workerMin/:workerMax/:workerErrorProbability', stream(ctx => testHttpWorker$(ctx)))
        .get('/test/http/direct/:min/:max/:errorProbability', stream(ctx => testHttpDirect$(ctx)))
        .post('/test/http/worker/:workerMin/:workerMax/:workerErrorProbability/:finalizeMin/:finalizeMax/:finalizeErrorProbability', stream(ctx => testHttpWorker$(ctx)))
        .post('/test/http/worker/:workerMin/:workerMax/:workerErrorProbability', stream(ctx => testHttpWorker$(ctx)))
        .post('/test/http/direct/:min/:max/:errorProbability', stream(ctx => testHttpDirect$(ctx)))
        .get('/test/ws/:name', stream(ctx => testWs$(ctx)))
