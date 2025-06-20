const {EMPTY, from, interval, catchError, delay, exhaustMap, filter, map, concatMap, switchMap, of} = require('rxjs')
const log = require('#sepal/log').getLogger('apps')
const {basename} = require('path')
const {cloneOrPull} = require('./git')
const {buildAndRestart, startContainer, isContainerRunning} = require('./docker')
const {fetchAppsFromApi$} = require('./appsService')

const monitorApps = () =>
    interval(10000).pipe(
        exhaustMap(() => apps$().pipe(
            concatMap(app => updateApp$(app).pipe(
                delay(10000),
            )),
        ))
    ).subscribe({
        error: error => log.fatal('Monitor exited:', error),
        complete: () => log.fatal('Monitor unexpectedly completed')
    })

const apps$ = () =>
    fetchAppsFromApi$().pipe(
        switchMap(({apps}) => from(apps)),
        filter(({repository}) => repository),
        filter(({endpoint}) => endpoint === 'docker'),
        map(({endpoint, label, repository, branch}) => {
            const name = basename(repository)
            return {
                endpoint,
                name,
                label,
                path: `/var/lib/sepal/app-manager/apps/${name}`,
                repository,
                branch
            }
        }),
        catchError(error => {
            log.error('Failed to list apps:', error)
            return EMPTY
        })
    )

const updateApp$ = ({path, repository, branch, name}) =>
    from(cloneOrPull({path, repository, branch})).pipe(
        switchMap(({action}) => {
            log.info(`Git operation completed: ${action}`)
            if (action === 'cloned' || action === 'updated') {
                log.info(`Repository ${action}. Building and restarting Docker containers.`)
                return from(buildAndRestart(name))
            }
            return from(isContainerRunning(name)).pipe(
                switchMap(running => {
                    if (!running) {
                        log.info('Containers are not running. Starting them without rebuilding.')
                        return from(startContainer(name))
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

module.exports = {monitorApps}
