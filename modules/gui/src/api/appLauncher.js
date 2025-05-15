import {get$, post$} from '~/http-client'

export default {
    getAppStatus$: appName =>
        get$(`/api/app-launcher/management/status/${appName}`),
    
    getAppLogs$: (appName, lines = 50) =>
        get$(`/api/app-launcher/management/logs/${appName}`, {
            query: {lines}
        }),
    
    restartApp$: (appName, forceRebuild = false) =>
        post$(`/api/app-launcher/management/restart/${appName}`, {
            query: {forceRebuild}
        }),
    
    updateApp$: appName =>
        post$(`/api/app-launcher/management/update/${appName}`)
}
