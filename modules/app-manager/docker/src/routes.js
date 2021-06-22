const {sendFile} = require('./sendFile')

module.exports = router =>
    router
        .get('/list', ctx => sendFile(ctx, '/var/sepal/app-manager/apps.json'))
        .get('/images/:filename', ctx => sendFile(ctx, `/var/sepal/app-manager/images/${ctx.params.filename}`))
