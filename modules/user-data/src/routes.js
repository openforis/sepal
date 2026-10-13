import {NotFoundException} from '#sepal/exception'

import {contentDisposition} from './contentDisposition.js'
import {requireAuth} from './currentUser.js'

// Forwarded explicitly rather than passed as method references: Access reads private state, so its
// operations must be invoked on their own instance.
export const createRoutes = (access, browser, usage) => router => router
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
    .get('/attachments/:id/download', requireAuth, async ctx => {
        ctx.set('Cache-Control', 'no-store')
        const result = await browser.download(username(ctx), ctx.query.path)
        if (result.redirect) {
            ctx.redirect(result.redirect)
        } else {
            ctx.set('Content-Disposition', contentDisposition(result.filename))
            ctx.set('Content-Length', String(result.size))
            ctx.type = result.contentType ?? 'application/octet-stream'
            ctx.body = result.stream
        }
    })
    .get('/attachments/:id/files', requireAuth, async ctx => {
        ctx.set('Cache-Control', 'no-store')
        requireData(ctx)
        const path = ctx.query.path
        const items = await browser.list(username(ctx), path ? `data/${path}` : 'data')
        ctx.body = {items}
    })
    .post('/attachments/:id/changed', requireAuth, ctx => {
        requireData(ctx)
        usage.measureSoon(username(ctx))
        ctx.status = 204
    })

const requireData = ctx => {
    if (ctx.params.id !== 'data') {
        throw new NotFoundException(`No attachment ${ctx.params.id}`)
    }
}

const username = ctx => ctx.state.currentUser.username
