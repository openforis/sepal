const {EMPTY, from, interval, catchError, delay, exhaustMap, filter, map, concatMap, switchMap} = require('rxjs')
const log = require('#sepal/log').getLogger('apps')
const {fileToJson$} = require('./file')
const {exec$} = require('./terminal')
const {basename} = require('path')

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
    fileToJson$('/var/lib/sepal/app-manager/apps.json').pipe(
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

const updateApp$ = app => {
    // Explicitly pass EE_CREDENTIALS_PATH to the child process
    const env = {
        EE_CREDENTIALS_PATH: process.env.EE_CREDENTIALS_PATH,
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        SEPAL_HOST: process.env.SEPAL_HOST
    }
    return exec$(
        '/',
        'update-app',
        [app.path, app.label, app.repository, app.branch || 'HEAD'],
        env
    ).pipe(
        catchError(error => {
            log.error('Failed to update app:', error)
            return EMPTY
        })
    )
}

module.exports = {monitorApps}
