const {of} = require('rxjs')
const {stream} = require('sepalHttpServer')
const log = require('sepalLog')()
const {submitTask} = require('./task')

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

        .delete('/api/tasks/:id', ctx => {
            console.log('********* DELETE  TASK', ctx.params.id) // TODO: Implement...
            ctx.status = 204
        })
