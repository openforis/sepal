import {wsStream} from '#sepal/httpServer'
import ws$ from './ws.js'

const routes = router => router

const wsRoutes = {
    '/ws': wsStream(ctx => ws$(ctx))
}

export {routes, wsRoutes}
