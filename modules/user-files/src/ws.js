const Job = require('#sepal/worker/job')
const {messageService, sendMessage$} = require('./messageService')
const logConfig = require('./log.json')

const getSepalUser = request => {
    const sepalUser = request.headers['sepal-user']
    return sepalUser
        ? JSON.parse(sepalUser)
        : {}
}

const getInitArgs = () => {
    const {homeDir, pollIntervalMilliseconds} = require('./config')
    return {homeDir, pollIntervalMilliseconds}
}

const worker$ = (username, {args$, initArgs: {homeDir, pollIntervalMilliseconds}}) => {
    const Path = require('path')
    const {realpath, readdir, stat, rm} = require('fs/promises')
    const {EMPTY, catchError, concat, timer, Subject, finalize, from, exhaustMap, distinctUntilChanged, takeUntil, takeWhile, switchMap} = require('rxjs')
    const {minDuration$} = require('#sepal/rxjs')
    const _ = require('lodash')
    const {resolvePath} = require('./filesystem')
    const log = require('#sepal/log').getLogger('ws')
    
    const REMOVE_COMFORT_DELAY_MS = 1000

    const out$ = new Subject()
    const stop$ = new Subject()

    const createWatcher = async ({out$, stop$, userHomeDir, pollIntervalMilliseconds}) => {
        const monitoredPaths = []
        const trigger$ = new Subject()
        const state = {
            enabled: true
        }
    
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
            data => out$.next(JSON.stringify(data))
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
        }
            
        const toTree = files =>
            _(files)
                .compact()
                .transform((tree, {name, ...file}) => tree[name] = {...file}, {})
                .value()
    
        const removePaths = (paths, options) =>
            Promise.all(
                paths.map(path => removePath(path, options))
            ).then(
                () => sendMessage$({username}).subscribe()
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
            const {absolutePath} = resolvePath(userHomeDir, path)
            if (!isMonitored(path)) {
                monitoredPaths.push({path, absolutePath})
                log.debug(() => `Monitoring path: ${path}`)
                trigger$.next()
            } else {
                log.warn(`Cannot monitor already-monitored path: ${path}`)
            }
        }
    
        const unmonitor = (path, {ignoreMissing} = {}) => {
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
    
        const remove = paths => {
            trigger$.next({remove: paths})
        }
    
        const enabled = enabled => {
            trigger$.next({enabled})
        }
    
        return {monitor, unmonitor, remove, enabled}
    }

    const init = async () => {
        const userHomeDir = await realpath(Path.join(homeDir, username))
        const watcher = await createWatcher({out$, stop$, userHomeDir, pollIntervalMilliseconds})

        watcher.monitor('/')

        const parseJSON = json => {
            try {
                return JSON.parse(json)
            } catch (error) {
                log.warn('Malformed JSON message:', json)
            }
        }
    
        const processMessage = json => {
            const msg = parseJSON(json)
            if (msg) {
                if (!_.isNil(msg.monitor)) {
                    watcher.monitor(msg.monitor)
                } else if (!_.isNil(msg.unmonitor)) {
                    watcher.unmonitor(msg.unmonitor)
                } else if (!_.isNil(msg.remove)) {
                    watcher.remove(msg.remove)
                } else if (!_.isNil(msg.enabled)) {
                    watcher.enabled(msg.enabled)
                } else {
                    log.warn('Unsupported message:', msg)
                }
            }
        }
    
        args$.subscribe(
            msg => processMessage(msg)
        )
    }

    return from(init()).pipe(
        switchMap(() => out$.pipe(
            finalize(
                () => stop$.next()
            )
        ))
    )
}

module.exports = Job(logConfig)({
    jobName: 'Files',
    jobPath: __filename,
    before: [],
    initArgs: () => getInitArgs(),
    services: [messageService],
    args: request => [getSepalUser(request).username],
    worker$
})
