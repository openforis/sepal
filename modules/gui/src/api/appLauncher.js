import {forkJoin, of} from 'rxjs'
import {catchError, map} from 'rxjs/operators'

import {get$, post$} from '~/http-client'

export default {
    getAppStatus$: appName =>
        forkJoin({
            status: get$(`/api/app-launcher/management/status/${appName}`),
            // This comes directly from the app
            resourcez: get$(`/api/app-launcher/${appName}/resourcez`).pipe(
                catchError(error => {
                    console.warn(`Failed to load resourcez for ${appName}:`, error)
                    return of({websockets: {open: 0}})
                })
            )
        }).pipe(
            map(({status, resourcez}) => ({
                ...status,
                resourcez
            }))
        ),
    
    getAppLogs$: (appName, lines = 50) =>
        get$(`/api/app-launcher/management/logs/${appName}`, {
            query: {lines}
        }),
    
    restartApp$: appName =>
        post$(`/api/app-launcher/management/restart/${appName}`, {
        }),
    
    buildAndRestartApp$: appName =>
        post$(`/api/app-launcher/management/build-restart/${appName}`, {
        }),
    
    pullUpdatesOnly$: (appName, branch) =>
        post$(`/api/app-launcher/management/pull/${appName}`, {
            query: {branch}
        }),
    
    updateApp$: (appName, branch) =>
        post$(`/api/app-launcher/management/update/${appName}`, {
            query: {branch}
        }),
    
    refreshProxies$: () =>
        post$('/api/app-launcher/management/refresh-proxies')
}
