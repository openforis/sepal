const {wsStream} = require('#sepal/httpServer')
const ws$ = require('./ws')
const koaBody = require('koa-body').default
const {download, listFiles, setFile, createFolder} = require('./filesystem')
const {homeDir} = require('./config')

const routes = router => router
    .get('/download', ctx => download(homeDir, ctx))
    .get('/listFiles', ctx => listFiles(homeDir, ctx))
    .post(
        '/setFile',
        koaBody({
            multipart: true,
            formidable: {
                maxFileSize: 100 * 1024 * 1024, // 100MB
                keepExtensions: true
            }
        }),
        ctx => setFile(homeDir, ctx)
    )
    .post('/createFolder', ctx => createFolder(homeDir, ctx))

const wsRoutes = {
    '/ws': wsStream(ctx => ws$(ctx))
}

module.exports = {routes, wsRoutes}
