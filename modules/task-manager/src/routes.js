import {requireAdmin, requireAuth, requireTaskSession} from './currentUser.js'

// Literal paths before /tasks/task/:id, which @koa/router would otherwise match first.
export const createRoutes = api => router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    .post('/tasks', requireAuth, api.submit)
    .post('/tasks/remove', requireAuth, api.removeFinished)
    .post('/tasks/api-key-authenticate', requireAdmin, api.authenticateApiKey)
    .get('/tasks/task/:id/details', requireAuth, api.getTaskDetails)
    .get('/tasks/task/:id', requireAuth, api.getTask)
    .post('/tasks/task/:id/cancel', requireAuth, api.cancel)
    .post('/tasks/task/:id/remove', requireAuth, api.remove)
    .post('/tasks/task/:id/execute', requireAuth, api.resubmit)
    .post('/tasks/task/:id/progress', requireTaskSession, api.progress)
