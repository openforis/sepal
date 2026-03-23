const {wsStream, stream} = require('#sepal/httpServer')
const {of} = require('rxjs')

const createRoutes = ({wsHandler}) => {
    const routes = router => router
        .get('/healthcheck', stream(() => of({status: 'ok'})))

    const wsRoutes = {
        '/ws': wsStream(ctx => wsHandler(ctx))
    }

    return {routes, wsRoutes}
}

module.exports = {createRoutes}
