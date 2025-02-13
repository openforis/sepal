const {wsStream} = require('#sepal/httpServer')
const ws$ = require('./ws')
const {download, listFiles} = require('./filesystem')
const {homeDir} = require('./config')

const routes = router => router
    .get('/download', ctx => download(homeDir, ctx))
    .get('/listFiles', ctx => listFiles(homeDir, ctx))

const wsRoutes = {
    '/ws': wsStream(ctx => ws$(ctx))
}

module.exports = {routes, wsRoutes}
