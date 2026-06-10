import {firstValueFrom} from 'rxjs'

import {getLogger} from '#sepal/log'

import {catalog$} from './apps.js'
import {staticLabextensionsMiddleware} from './labextensions.js'
import {sendFile} from './sendFile.js'
const log = getLogger('routes')

const sendApps = async ctx => {
    try {
        const payload = await firstValueFrom(catalog$())
        ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate')
        ctx.type = 'application/json'
        ctx.body = payload
    } catch (error) {
        log.error('Failed to load apps catalog:', error)
        ctx.status = 500
        ctx.body = {error: 'Failed to load apps'}
    }
}

export default router =>
    router
        .get('/list', sendApps)
        .get('/images/:filename', ctx => sendFile(ctx, `/var/lib/sepal/app-manager/images/${ctx.params.filename}`))
        .get('/labextensions/:app_name/{*path}', staticLabextensionsMiddleware)
