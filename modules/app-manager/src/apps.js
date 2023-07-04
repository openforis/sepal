const {EMPTY, from, interval, catchError, delay, exhaustMap, filter, map, concatMap, switchMap} = require('rxjs')
const log = require('#sepal/log').getLogger('apps')
const {fileToJson$} = require('./file')
const {exec$} = require('./terminal')
const {basename} = require('path')

const monitorApps = () =>
    interval(5000).pipe(
        exhaustMap(() => apps$().pipe(
            concatMap(app => updateApp$(app).pipe(
                delay(5000)
            ))
        ))
    ).subscribe({
        error: error => log.fatal('Monitor exited:', error),
        complete: () => log.fatal('Monitor unexpectedly completed')
    })

const apps$ = () =>
    fileToJson$('/var/lib/sepal/app-manager/apps.json').pipe(
        switchMap(({apps}) => from(apps)),
        filter(({repository}) => repository),
        map(({endpoint = 'shiny', label, repository, branch}) => {
            const name = basename(repository)
            return {
                endpoint,
                name,
                label,
                path: endpoint === 'jupyter'
                    ? `/var/lib/sepal/app-manager/apps/${name}`
                    : `/shiny/${name}`,
                repository,
                branch
            }
        }),
        catchError(error => {
            log.error('Failed to list apps:', error)
            return EMPTY
        })
    )

const updateApp$ = app => {
    log.info('Updating app', app.path)
    return exec$(
        '/',
        'sudo',
        ['update-app', app.path, app.label, app.repository, app.branch || 'HEAD']
    ).pipe(
        catchError(error => {
            log.error('Failed to update app:', error)
            return EMPTY
        })
    )
}

module.exports = {monitorApps}
