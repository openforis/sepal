const {getAppStatus, getAppLogs, restartApp, updateApp} = require('./appsService')

module.exports = router => router
    .get('/status/:appName', async ctx => await getAppStatus(ctx))
    .get('/logs/:appName', async ctx => await getAppLogs(ctx))
    .post('/restart/:appName', async ctx => await restartApp(ctx))
    .post('/update/:appName', async ctx => await updateApp(ctx))

