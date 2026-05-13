const {firstValueFrom} = require('rxjs')
const {sendFile} = require('./sendFile')
const {staticLabextensionsMiddleware} = require('./labextensions')
const {catalog$} = require('./apps')
const log = require('#sepal/log').getLogger('routes')

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

module.exports = router =>
    router
        .get('/list', sendApps)
        .get('/images/:filename', ctx => sendFile(ctx, `/var/lib/sepal/app-manager/images/${ctx.params.filename}`))
        .get('/labextensions/:app_name/{*path}', staticLabextensionsMiddleware)
