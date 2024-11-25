const Path = require('path')
const {realpath, readdir, stat, rm} = require('fs/promises')
const {catchError, timer, Subject, exhaustMap, distinctUntilChanged, takeUntil, switchMap, map, filter, mergeMap, groupBy, finalize, mergeWith, EMPTY} = require('rxjs')
const {minDuration$} = require('#sepal/rxjs')
const _ = require('lodash')
const {homeDir, pollIntervalMilliseconds} = require('./config')
const {resolvePath} = require('./filesystem')
const {subscriptionTag, clientTag} = require('./tag')
const log = require('#sepal/log').getLogger('watcher')

const REMOVE_COMFORT_DELAY_MS = 1000

const userHomeDir = async username =>
    await realpath(Path.join(homeDir, username))

const createWatcher = async ({out$, stop$}) => {
    const monitor$ = new Subject()
    const unmonitor$ = new Subject()
    const remove$ = new Subject()
    const unsubscribe$ = new Subject()
    const offline$ = new Subject()
    const trigger$ = new Subject()

    const subscriptionTrigger$ = (clientId, subscriptionId) =>
        trigger$.pipe(
            filter(current =>
                current.clientId === clientId
                && current.subscriptionId === subscriptionId
            )
        )

    const subscriptionUnmonitor$ = (clientId, subscriptionId, path) =>
        unmonitor$.pipe(
            filter(current =>
                current.clientId === clientId
                && current.subscriptionId === subscriptionId
                && (path === current.path || path.startsWith(toDir(current.path)))
            )
        )

    const subscriptionUnsubscribe$ = (clientId, subscriptionId) =>
        unsubscribe$.pipe(
            filter(current =>
                current.clientId === clientId
                && current.subscriptionId === subscriptionId
            )
        )

    const clientOffline$ = clientId =>
        offline$.pipe(
            filter(current => current.clientId === clientId)
        )

    monitor$.pipe(
        groupBy(({clientId}) => clientId),
        mergeMap(clientGroup$ => clientGroup$.pipe(
            groupBy(({subscriptionId}) => subscriptionId),
            mergeMap(subscriptionGroup$ => subscriptionGroup$.pipe(
                mergeMap(({username, clientId, subscriptionId, path}) =>
                    timer(0, pollIntervalMilliseconds).pipe(
                        mergeWith(subscriptionTrigger$(clientId, subscriptionId)),
                        exhaustMap(() => scanDir({username, clientId, subscriptionId, path})),
                        distinctUntilChanged(_.isEqual),
                        takeUntil(subscriptionUnmonitor$(clientId, subscriptionId, path)),
                        finalize(() => log.debug(`${subscriptionTag({username, clientId, subscriptionId})} unmonitored path: ${path}`))
                    )
                ),
                takeUntil(subscriptionUnsubscribe$(clientGroup$.key, subscriptionGroup$.key)),
                finalize(() => log.debug(`${subscriptionTag({clientId: clientGroup$.key, subscriptionId: subscriptionGroup$.key})} unsubscribed`))
            )),
            takeUntil(clientOffline$(clientGroup$.key)),
            finalize(() => log.debug(`${clientTag({clientId: clientGroup$.key})} offline`))
        )),
        takeUntil(stop$),
        catchError(error => log.error(error))
    ).subscribe({
        next: ({clientId, subscriptionId, path, items}) => out$.next({clientId, subscriptionId, data: {path, items}}),
        error: error => log.error('Unexpected stream error', error),
        complete: () => log.error('Unexpected stream complete')
    })

    remove$.pipe(
        switchMap(({username, clientId, subscriptionId, remove}) =>
            minDuration$(
                removePath({username, clientId, subscriptionId, path: remove}),
                REMOVE_COMFORT_DELAY_MS
            ).pipe(
                map(() => ({username, clientId, subscriptionId}))
            )
        )
    ).subscribe({
        next: ({username, clientId, subscriptionId}) => trigger$.next({username, clientId, subscriptionId})
    })

    const scanDir = async ({username, clientId, subscriptionId, path}) => {
        const home = await userHomeDir(username)
        const {absolutePath, isExternalPath} = resolvePath(home, path)
        if (isExternalPath) {
            log.warn(`${subscriptionTag({username, clientId, subscriptionId})} requested invalid path: ${path}`)
            return EMPTY
        } else {
            return readdir(absolutePath)
                .then(files =>
                    scanFiles({absolutePath, files})
                        .then(files => ({username, clientId, subscriptionId, path, items: toTree(files)}))
                )
                .catch(error => {
                    log.warn(error)
                    unmonitor({username, clientId, subscriptionId, path})
                    return ({path, error: error.code})
                })
        }
    }

    const scanFiles = async ({absolutePath, files}) =>
        Promise.all(
            files.map(filename => scanFile(absolutePath, filename))
        )

    const scanFile = async (path, filename) => {
        try {
            const {absolutePath, isSubPath} = resolvePath(path, filename)
            if (isSubPath) {
                return stat(absolutePath)
                    .then(stat => {
                        const info = {
                            name: filename,
                            mtime: stat.mtimeMs
                        }
                        if (stat.isDirectory()) {
                            info.dir = true
                        }
                        if (stat.isFile()) {
                            info.file = true
                            info.size = stat.size
                        }
                        return info
                    })
                    .catch(error => {
                        log.warn(() => [`Ignoring unresolvable path: ${path}`, error])
                    })
            } else {
                log.debug(() => `Ignoring non-subdir path: ${path}`)
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                log.debug(() => `Ignored non-existing path: ${path}`)
            } else {
                log.error(error)
            }
        }
    }
        
    const toTree = files =>
        _(files)
            .compact()
            .transform((tree, {name, ...file}) => tree[name] = {...file}, {})
            .value()

    const removePath = async ({username, clientId, subscriptionId, path}) => {
        if (_.isArray(path)) {
            return Promise.all(
                path.map(path => removePath({username, clientId, subscriptionId, path}))
            )
        } else {
            unmonitor({username, clientId, subscriptionId, path})
            log.debug(() => `${subscriptionTag({username, clientId, subscriptionId})} removing path: ${path}`)
            try {
                const {absolutePath} = resolvePath(await userHomeDir(username), path)
                return await rm(absolutePath, {recursive: true})
            } catch (error) {
                if (error.code === 'ENOENT') {
                    log.debug(() => `Ignored non-existing path: ${path}`)
                } else {
                    log.error(error)
                }
            }
        }
    }

    const toDir = path =>
        path.substr(-1) === '/' ? path : Path.join(path, '/')

    const monitor = ({username, clientId, subscriptionId, path}) => {
        if (_.isArray(path)) {
            path.forEach(path => monitor({username, clientId, subscriptionId, path}))
        } else {
            monitor$.next({username, clientId, subscriptionId, path})
        }
    }

    const unmonitor = ({username, clientId, subscriptionId, path}) => {
        if (_.isArray(path)) {
            path.forEach(path => unmonitor({username, clientId, subscriptionId, path}))
        } else {
            unmonitor$.next({username, clientId, subscriptionId, path})
        }
    }

    const remove = ({username, clientId, subscriptionId, path}) => {
        if (_.isArray(path)) {
            path.forEach(path => remove({username, clientId, subscriptionId, path}))
        } else {
            remove$.next({username, clientId, subscriptionId, remove: path})
        }
    }

    const unsubscribe = ({username, clientId, subscriptionId}) =>
        unsubscribe$.next({username, clientId, subscriptionId})

    const offline = ({username, clientId}) =>
        offline$.next({username, clientId})

    return {monitor, unmonitor, remove, unsubscribe, offline}
}

module.exports = {createWatcher}
