export const createRoutes = () => router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
