const {getAppStatus, getAppLogs, restartApp, updateApp, pullUpdatesOnly, buildAndRestartApp, refreshProxies} = require('./appsService')

module.exports = router => router
    .get('/status/:appName', async ctx => await getAppStatus(ctx))
    .get('/logs/:appName', async ctx => await getAppLogs(ctx))
    .post('/restart/:appName', async ctx => await restartApp(ctx))
    .post('/update/:appName', async ctx => await updateApp(ctx))
    .post('/pull/:appName', async ctx => await pullUpdatesOnly(ctx))
    .post('/build-restart/:appName', async ctx => await buildAndRestartApp(ctx))
    .post('/refresh-proxies', async ctx => await refreshProxies(ctx))

