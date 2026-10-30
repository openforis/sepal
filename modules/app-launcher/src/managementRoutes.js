import {buildAndRestartApp, getAppContainerStatus, getAppLogs, getAppRepoInfo, restartApp} from './appsService.js'

export default router => router
    .get('/container-status/:appName', async ctx => await getAppContainerStatus(ctx))
    .get('/repo-info/:appName', async ctx => await getAppRepoInfo(ctx))
    .get('/logs/:appName', async ctx => await getAppLogs(ctx))
    .post('/restart/:appName', async ctx => await restartApp(ctx))
    .post('/build-restart/:appName', async ctx => await buildAndRestartApp(ctx))
