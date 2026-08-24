import {requireAuth} from './currentUser.js'
import * as api from './dataApi.js'

const routes = router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    .get('/map-api-keys', requireAuth, api.mapApiKeys)
    .post('/best-scenes', requireAuth, api.bestScenes)
    .get('/sceneareas/:sceneAreaId', requireAuth, api.scenesForArea)

export {routes}
