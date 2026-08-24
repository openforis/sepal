import {requireAdmin, requireAuth} from './currentUser.js'
import * as api from './messageApi.js'

const routes = router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    .post('/messages/:id', requireAdmin, api.saveMessage)
    .delete('/messages/:id', requireAdmin, api.removeMessage)
    .get('/notifications', requireAuth, api.listNotifications)
    .post('/notifications/:id', requireAuth, api.updateNotification)

export {routes}
