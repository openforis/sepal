import koaBody from 'koa-body'

import {wsStream} from '#sepal/httpServer'

import {homeDir} from './config.js'
import {createFolder, download, listFiles, setFile} from './filesystem.js'
import ws$ from './ws.js'

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
