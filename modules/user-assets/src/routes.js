const {wsStream} = require('#sepal/httpServer')
const ws$ = require('./ws')

const routes = router => router

const wsRoutes = {
    '/ws': wsStream(ctx => ws$(ctx))
}

module.exports = {routes, wsRoutes}
