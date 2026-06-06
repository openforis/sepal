import {buildAndRestartApp, getAppContainerStatus, getAppLogs, getAppRepoInfo, getAppStatus, pullUpdatesOnly, restartApp, updateApp} from './appsService.js'

export default router => router
    .get('/status/:appName', async ctx => await getAppStatus(ctx))
    .get('/container-status/:appName', async ctx => await getAppContainerStatus(ctx))
    .get('/repo-info/:appName', async ctx => await getAppRepoInfo(ctx))
    .get('/logs/:appName', async ctx => await getAppLogs(ctx))
    .post('/restart/:appName', async ctx => await restartApp(ctx))
    .post('/update/:appName', async ctx => await updateApp(ctx))
    .post('/pull/:appName', async ctx => await pullUpdatesOnly(ctx))
    .post('/build-restart/:appName', async ctx => await buildAndRestartApp(ctx))

