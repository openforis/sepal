const {sendFile, sendFileNoCache} = require('./sendFile')
const {staticLabextensionsMiddleware} = require('./labextensions')

module.exports = router =>
    router
        .get('/list', ctx => sendFileNoCache(ctx, '/var/lib/sepal/app-manager/apps.json'))
        .get('/images/:filename', ctx => sendFile(ctx, `/var/lib/sepal/app-manager/images/${ctx.params.filename}`))
        .get('/labextensions/:app_name/(.*)', staticLabextensionsMiddleware)
