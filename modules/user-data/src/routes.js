import {requireAuth} from './currentUser.js'

// Forwarded explicitly rather than passed as method references: Access reads private state, so its
// operations must be invoked on their own instance.
export const createRoutes = access => router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    .get('/attachments', requireAuth, ctx => {
        ctx.body = access.list(username(ctx))
    })
    .post('/attachments/:id/access', requireAuth, async ctx => {
        ctx.set('Cache-Control', 'no-store')
        ctx.body = await access.grant(username(ctx), ctx.params.id, ctx.request.body?.purpose)
    })
    .get('/attachments/:id/credentials', requireAuth, async ctx => {
        ctx.set('Cache-Control', 'no-store')
        ctx.body = await access.credentials(username(ctx), ctx.params.id)
    })

const username = ctx => ctx.state.currentUser.username
