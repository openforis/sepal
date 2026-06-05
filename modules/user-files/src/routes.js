import {wsStream} from '#sepal/httpServer'
import ws$ from './ws.js'
import koaBody from 'koa-body'
import {download, listFiles, setFile, createFolder} from './filesystem.js'
import {homeDir} from './config.js'

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

export {routes, wsRoutes}
