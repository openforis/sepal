const {getAppStatus, getAppLogs, restartApp, updateApp} = require('./appsApi')

module.exports = router => router
    .get('/status/:appName', async ctx => {
        await getAppStatus(ctx.params.appName, ctx.request, ctx)
    })
    .get('/logs/:appName', async ctx => await getAppLogs(ctx.params.appName, ctx.request, ctx))
    .post('/restart/:appName', async ctx => await restartApp(ctx.params.appName, ctx.request, ctx))
    .post('/update/:appName', async ctx => await updateApp(ctx.params.appName, ctx.request, ctx))

