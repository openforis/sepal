import {requireAuth} from '#sepal/currentUser'

export const createRoutes = api => router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    .get('/map-api-keys', requireAuth, ctx => api.mapApiKeys(ctx))
    .post('/best-scenes', requireAuth, ctx => api.bestScenes(ctx))
    .get('/sceneareas/:sceneAreaId', requireAuth, ctx => api.scenesForArea(ctx))
