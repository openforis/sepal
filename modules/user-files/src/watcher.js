const Path = require('path')
const {realpath, readdir, stat, rm} = require('fs/promises')
const {EMPTY, catchError, concat, timer, Subject, from, exhaustMap, distinctUntilChanged, takeUntil, takeWhile, switchMap} = require('rxjs')
const {minDuration$} = require('#sepal/rxjs')
const _ = require('lodash')
const {homeDir, pollIntervalMilliseconds} = require('./config')
const {resolvePath} = require('./filesystem')
const log = require('#sepal/log').getLogger('watcher')

const REMOVE_COMFORT_DELAY_MS = 1000

const watchers = {}

const createWatcher = async ({username, out$, stop$}) => {
    const monitoredPaths = []
    const trigger$ = new Subject()
    const state = {
        enabled: true
    }

    const userHomeDir = await realpath(Path.join(homeDir, username))

    const triggerAction$ = trigger => {
        if (trigger) {
            if (!_.isNil(trigger.enabled)) {
                state.enabled = trigger.enabled
            }
            if (!_.isNil(trigger.remove)) {
                const removePaths$ = from(
                    removePaths(trigger.remove, {ignoreMissing: true})
                )
                return minDuration$(removePaths$, REMOVE_COMFORT_DELAY_MS)
            }
        }
        return EMPTY
    }

    const poll$ =
        timer(0, pollIntervalMilliseconds).pipe(
            takeWhile(() => state.enabled)
        )

    trigger$.pipe(
        switchMap(trigger =>
            concat(triggerAction$(trigger), poll$)
        ),
        exhaustMap(() => from(scanDirs())),
        distinctUntilChanged(_.isEqual),
        takeUntil(stop$),
        catchError(error => {
            log.error(error)
        })
    ).subscribe(
        data => out$.next({username, data})
    )

    const scanDirs = () =>
        Promise.all(
            monitoredPaths.map(item => scanDir(item))
        )

    const scanDir = ({path, absolutePath}) =>
        readdir(absolutePath)
            .then(files =>
                scanFiles({absolutePath, files})
                    .then(files => ({path, items: toTree(files)}))
            )
            .catch(error => {
                log.warn(error)
                unmonitor(path)
                return ({path, error: error.code})
            })

    const scanFiles = ({absolutePath, files}) =>
        Promise.all(
            files.map(filename => scanFile(absolutePath, filename))
        )

    const scanFile = (path, filename) => {
        try {
            const {absolutePath, isSubPath} = resolvePath(path, filename)
            if (isSubPath) {
                return stat(absolutePath)
                    .then(stat => ({
                        name: filename,
                        dir: stat.isDirectory(),
                        file: stat.isFile(),
                        size: stat.size,
                        mtime: stat.mtime
                    }))
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

    const removePaths = (paths, options) =>
        Promise.all(
            paths.map(path => removePath(path, options))
        )

    const removePath = (path, options) => {
        unmonitor(path, options)
        log.debug(() => `Removing path: ${path}`)
        try {
            const {absolutePath} = resolvePath(userHomeDir, path)
            return rm(absolutePath, {recursive: true})
        } catch (error) {
            if (error.code === 'ENOENT') {
                log.debug(() => `Ignored non-existing path: ${path}`)
            } else {
                log.error(error)
            }
        }
    }

    const isMonitored = path =>
        _.find(monitoredPaths, ({path: monitoredPath}) => monitoredPath === path)

    const toDir = path =>
        path.substr(-1) === '/' ? path : Path.join(path, '/')

    const monitor = path => {
        if (_.isArray(path)) {
            path.forEach(path => monitor(path))
        } else {
            try {
                const {absolutePath} = resolvePath(userHomeDir, path)
                if (!isMonitored(path)) {
                    monitoredPaths.push({path, absolutePath})
                    log.debug(() => `Monitoring path: ${path}`)
                    trigger$.next()
                } else {
                    log.warn(`Cannot monitor already-monitored path: ${path}`)
                }
            } catch (error) {
                if (error.code === 'ENOENT') {
                    log.debug(() => `Ignored non-existing path: ${path}`)
                } else {
                    log.error(error)
                }
            }
        }
    }

    const unmonitor = (path, {ignoreMissing} = {}) => {
        if (_.isArray(path)) {
            path.forEach(path => unmonitor(path))
        } else {
            if (isMonitored(path)) {
                const pathDir = toDir(path)
                const unmonitoredPaths = _.remove(monitoredPaths,
                    ({path: monitoredPath}) => monitoredPath.startsWith(pathDir) || monitoredPath === path
                )
                unmonitoredPaths.forEach(({path}) => log.debug(() => `Unmonitoring path: ${path}`))
            } else {
                if (ignoreMissing) {
                    log.debug(() => `Ignored non-monitored path: ${path}`)
                } else {
                    log.warn(`Cannot unmonitor non-monitored path: ${path}`)
                }
            }
        }
    }

    const remove = paths => {
        trigger$.next({remove: paths})
    }

    const enabled = enabled => {
        trigger$.next({enabled})
        if (!isMonitored('/')) {
            monitor('/')
        }
    }

    const watcher = {monitor, unmonitor, remove, enabled}
    watchers[username] = watcher
}

const getWatcher = async ({username, out$, stop$, create}) => {
    if (!watchers[username] && create) {
        await createWatcher({username, out$, stop$})
    }
    return watchers[username]
}

const removeWatcher = username => {
    const watcher = watchers[username]
    watcher.unmonitor('/')
    delete watchers[username]
}

const removeAllWatchers = () =>
    Object.keys(watchers).forEach(
        username => removeWatcher(username)
    )

module.exports = {getWatcher, removeWatcher, removeAllWatchers}
