const Path = require('path')
const {realpath, readdir, stat, rm} = require('fs/promises')
const {EMPTY, catchError, concat, timer, Subject, from, exhaustMap, distinctUntilChanged, takeUntil, takeWhile, switchMap, map, filter} = require('rxjs')
const {minDuration$} = require('#sepal/rxjs')
const _ = require('lodash')
const {homeDir, pollIntervalMilliseconds} = require('./config')
const {resolvePath} = require('./filesystem')
const {clientTag, subscriptionTag} = require('./tag')
const log = require('#sepal/log').getLogger('watcher')

const REMOVE_COMFORT_DELAY_MS = 1000

const watchersBySubscriptionId = {}
const subscriptionIdsByClientId = {}

const createWatcher = async ({username, clientId, subscriptionId, out$, stop$}) => {
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
                    removePaths(trigger.remove)
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
        map(updates => updates.filter(({path}) => isMonitored(path))),
        filter(updates => updates.length > 0),
        takeUntil(stop$),
        catchError(error => {
            log.error(error)
        })
    ).subscribe(
        data => out$.next({clientId, subscriptionId, data})
    )

    const scanDirs = async () =>
        Promise.all(
            monitoredPaths.map(item => scanDir(item))
        )

    const scanDir = async ({path, absolutePath}) =>
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

    const scanFiles = async ({absolutePath, files}) =>
        Promise.all(
            files.map(filename => scanFile(absolutePath, filename))
        )

    const scanFile = async (path, filename) => {
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

    const removePaths = async paths =>
        Promise.all(
            paths.map(path => removePath(path))
        )

    const removePath = async path => {
        unmonitor(path)
        log.debug(() => `${subscriptionTag({username, clientId, subscriptionId})} removing path: ${path}`)
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
                    log.debug(() => `${subscriptionTag({username, clientId, subscriptionId})} monitoring path: ${path}`)
                    trigger$.next()
                } else {
                    log.debug(() => `Ignored monitoring already-monitored path: ${path}`)
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

    const unmonitor = path => {
        if (_.isArray(path)) {
            path.forEach(path => unmonitor(path))
        } else {
            if (isMonitored(path)) {
                const pathDir = toDir(path)
                const unmonitoredPaths = _.remove(monitoredPaths,
                    ({path: monitoredPath}) => monitoredPath.startsWith(pathDir) || monitoredPath === path
                )
                unmonitoredPaths.forEach(
                    ({path}) => log.debug(() => `${subscriptionTag({username, clientId, subscriptionId})} unmonitoring path: ${path}`)
                )
            } else {
                log.debug(() => `Ignored non-monitored path: ${path}`)
            }
        }
    }

    const remove = paths => {
        trigger$.next({remove: paths})
    }

    const enabled = enabled => {
        trigger$.next({enabled})
    }

    const watcher = {monitor, unmonitor, remove, enabled}

    watchersBySubscriptionId[subscriptionId] = watcher
    subscriptionIdsByClientId[clientId] = [
        ...(subscriptionIdsByClientId[clientId] || []),
        subscriptionId
    ]
}

const getWatcher = async ({username, clientId, subscriptionId, out$, stop$, create}) => {
    if (!watchersBySubscriptionId[subscriptionId] && create) {
        await createWatcher({username, clientId, subscriptionId, out$, stop$})
    }
    return watchersBySubscriptionId[subscriptionId]
}

const removeWatcher = (clientId, subscriptionId) => {
    log.debug(() => `Removing ${subscriptionTag({clientId, subscriptionId})} watcher`)
    const watcher = watchersBySubscriptionId[subscriptionId]
    if (watcher) {
        watcher.unmonitor('/')
        _.pull(subscriptionIdsByClientId[clientId], subscriptionId)
        delete watchersBySubscriptionId[subscriptionId]
    }
}

const removeClientWatchers = clientId => {
    (subscriptionIdsByClientId[clientId] || []).forEach(
        subscriptionId => removeWatcher(clientId, subscriptionId)
    )
    delete subscriptionIdsByClientId[clientId]
    log.debug(() => `Removing ${clientTag({clientId})} watchers`)
}

const removeAllWatchers = () => {
    log.debug('Removing all watchers')
    Object.keys(subscriptionIdsByClientId).forEach(
        clientId => removeClientWatchers(clientId)
    )
}

module.exports = {getWatcher, removeWatcher, removeClientWatchers, removeAllWatchers}
