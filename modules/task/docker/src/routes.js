const {submitTask, cancelTask} = require('./task')

module.exports = router =>
    router
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
