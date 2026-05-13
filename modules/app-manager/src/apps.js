const {EMPTY, defer, from, interval, catchError, defaultIfEmpty, delay, exhaustMap, filter, map, concatMap, switchMap, of} = require('rxjs')
const log = require('#sepal/log').getLogger('apps')
const {fileToJson$} = require('./file')
const {fetchCatalog$} = require('./apiService')
const {exec$} = require('./terminal')
const {basename} = require('path')
const {appsCatalogUrl} = require('./config')

const APPS_FILE = '/var/lib/sepal/app-manager/apps.json'

const MANAGED_ENDPOINTS = ['shiny', 'jupyter', 'rstudio']

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

const diskSource$ = () => fileToJson$(APPS_FILE)

const source$ = () => defer(() => {
    if (!appsCatalogUrl) return diskSource$()
    return fetchCatalog$(appsCatalogUrl).pipe(
        defaultIfEmpty(null),
        switchMap(payload => payload ? of(payload) : diskSource$())
    )
})

const apps$ = () =>
    source$().pipe(
        switchMap(({apps}) => from(apps)),
        filter(({repository}) => repository),
        filter(({endpoint}) => MANAGED_ENDPOINTS.includes(endpoint)),
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

const catalog$ = () => source$()

module.exports = {monitorApps, apps$, source$, catalog$}
