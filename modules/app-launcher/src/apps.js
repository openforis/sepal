import {catchError, concatMap, defer, EMPTY, filter, from, map, of, repeat, switchMap} from 'rxjs'

import {getLogger} from '#sepal/log'
const log = getLogger('apps')
import {basename} from 'path'

import {fetchAppsFromApi$, fetchCatalog$} from './apiService.js'
import {appsCatalogUrl} from './config.js'
import {buildAndRestart, isContainerRunning, startContainer} from './docker.js'
import {cloneOrPull} from './git.js'
import {refreshProxyEndpoints} from './proxyManager.js'

const UPDATE_DELAY_SECONDS = 30

const monitorApps = () =>
    defer(() => apps$()).pipe(
        concatMap(app => updateApp$(app)),
        repeat({delay: UPDATE_DELAY_SECONDS * 1000})
    ).subscribe({
        error: error => log.fatal('Monitor exited:', error),
        complete: () => log.fatal('Monitor unexpectedly completed')
    })

const source$ = () => appsCatalogUrl
    ? fetchCatalog$(appsCatalogUrl)
    : fetchAppsFromApi$()

const apps$ = () =>
    source$().pipe(
        switchMap(({apps}) => from(apps)),
        filter(({repository}) => repository),
        filter(({endpoint}) => endpoint === 'docker'),
        map(({endpoint, label, repository, branch, commit}) => {
            const name = basename(repository).replace(/\.git$/, '')
            return {
                endpoint,
                name,
                label,
                path: `/var/lib/sepal/app-launcher/apps/${name}`,
                repository,
                branch,
                commit: commit || null
            }
        }),
        catchError(error => {
            log.error('Failed to list apps:', error)
            return EMPTY
        })
    )

const updateApp$ = ({path, repository, branch, commit, name}) =>
    from(cloneOrPull({path, repository, branch, commit})).pipe(
        switchMap(({action}) => {
            log.info(`Git operation completed: ${action}`)
            if (action === 'cloned' || action === 'updated') {
                log.info(`Repository ${action}. Building and restarting Docker containers.`)
                return from(buildAndRestart(name, repository))
            }
            return from(isContainerRunning(name)).pipe(
                switchMap(running => {
                    if (!running) {
                        log.info('Containers are not running. Starting them without rebuilding.')
                        return from(startContainer(name)).pipe(
                            switchMap(() => refreshProxies())
                        )
                    }
                    log.info('No updates available and containers are running.')
                    return of(null)
                })
            )
        }),
        catchError(error => {
            log.error('Failed to update app:', error)
            return EMPTY
        })
    )

const refreshProxies = () => {
    log.info('Refreshing proxy endpoints after container started...')
    return from(refreshProxyEndpoints()).pipe(
        catchError(error => {
            log.error('Failed to refresh proxy endpoints:', error)
            return of(null)
        })
    )
}

export {apps$, monitorApps, source$}
