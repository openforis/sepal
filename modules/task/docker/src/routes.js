const {stream} = require('sepal/httpServer')

const {submitTask, cancelTask} = require('./task')

const testHttp$ = require('root/jobs/test/http')
const testHttpDirect$ = require('root/jobs/test/http/test')
const testWs$ = require('root/jobs/test/ws')

module.exports = router =>
    router
        .get('/healthcheck', ctx => ctx.status = 200)

        .post('/api/tasks', ctx => {
            const {id, operation, params} = ctx.request.body
            // TODO: Look at the header - should contain the user
            submitTask({
                id,
                name: operation,
                params: JSON.parse(params)
            })
            ctx.status = 204
        })

        .delete('/api/tasks/:taskId', ctx => {
            const {taskId} = ctx.params
            cancelTask(taskId)
            ctx.status = 204
        })

        .get('/test/worker/:min/:max/:errorProbability', stream(ctx => testHttp$(ctx)))
        .get('/test/direct/:min/:max/:errorProbability', stream(
            ({params: {min, max, errorProbability}}) => testHttpDirect$(parseInt(min), parseInt(max), parseInt(errorProbability))
        ))
        .get('/ws/:name', stream(ctx => testWs$(ctx)))
