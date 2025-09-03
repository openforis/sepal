import {forkJoin, of} from 'rxjs'
import {catchError, map, switchMap} from 'rxjs/operators'

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
    
    getAppContainerStatus$: appName => {
        // First, get the container status
        return get$(`/api/app-launcher/management/container-status/${appName}`).pipe(
            switchMap(containerStatus => {
                // Check if container is healthy before trying to get resourcez
                const isHealthy = containerStatus.container?.health?.status === 'healthy'
                
                if (isHealthy) {
                    // If healthy, try to get resourcez
                    return get$(`/api/app-launcher/${appName}/resourcez`).pipe(
                        map(resourcez => ({
                            ...containerStatus,
                            resourcez
                        })),
                        catchError(error => {
                            console.warn(`Failed to load resourcez for ${appName} (healthy container):`, error)
                            return of({
                                ...containerStatus,
                                resourcez: {websockets: {open: 0}}
                            })
                        })
                    )
                } else {
                    // If not healthy, don't even try resourcez
                    console.info(`Container ${appName} is ${containerStatus.container?.health?.status || 'unknown'}, skipping resourcez call`)
                    return of({
                        ...containerStatus,
                        resourcez: {websockets: {open: 0}}
                    })
                }
            }),
            catchError(error => {
                console.error(`Failed to load container status for ${appName}:`, error)
                throw error
            })
        )
    },
    
    getAppRepoInfo$: appName =>
        get$(`/api/app-launcher/management/repo-info/${appName}`),
    
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
}
