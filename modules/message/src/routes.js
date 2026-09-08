import {requireAdmin, requireAuth} from './currentUser.js'

// Forwarded explicitly rather than passed as method references: the API's operations read private
// state, so they must be invoked on their own instance.
export const createRoutes = api => router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    .post('/messages/:id', requireAdmin, ctx => api.saveMessage(ctx))
    .delete('/messages/:id', requireAdmin, ctx => api.removeMessage(ctx))
    .get('/notifications', requireAuth, ctx => api.listNotifications(ctx))
    .post('/notifications/:id', requireAuth, ctx => api.updateNotification(ctx))
