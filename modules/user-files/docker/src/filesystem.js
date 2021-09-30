const {readdir, stat, rm} = require('fs/promises')
const log = require('sepal/log').getLogger('filesystem')
const Path = require('path')
const {EMPTY, concat, timer, from, Subject} = require('rxjs')
const {exhaustMap, distinctUntilChanged, switchMap, takeUntil, takeWhile} = require('rxjs/operators')
const _ = require('lodash')
const {minDuration$} = require('sepal/rxjs/operators')

const REMOVE_COMFORT_DELAY_MS = 1000

const createWatcher = async ({out$, stop$, baseDir, pollIntervalMilliseconds}) => {
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
        takeUntil(stop$)
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
                    .then(files => ({path, tree: toTree(files)}))
            )
            .catch(error => ({path, error: error.code}))

    const scanFiles = ({absolutePath, files}) =>
        Promise.all(
            files.map(filename => scanFile(absolutePath, filename))
        )

    const scanFile = (absolutePath, filename) =>
        stat(Path.resolve(absolutePath, filename))
            .then(stat => ({
                name: filename,
                dir: stat.isDirectory(),
                file: stat.isFile(),
                size: stat.size,
                mtime: stat.mtimeNs,
            }))

    const toTree = files =>
        _.transform(files, (tree, {name, ...file}) => tree[name] = {...file}, {})

    const removePaths = (paths, options) =>
        Promise.all(
            paths.map(path => removePath(path, options))
        )

    const removePath = (path, options) => {
        unmonitor(path, options)
        log.debug(() => `Removing path: ${path}`)
        return rm(getAbsolutePath(path), {recursive: true})
    }

    const getAbsolutePath = path => {
        const absolutePath = Path.normalize(Path.join(baseDir, path))
        const relativePath = Path.relative(baseDir, absolutePath)
        if (relativePath.startsWith('..')) {
            log.warn(`Cannot access path above user home: ${absolutePath}`)
            return null
        } else {
            return absolutePath
        }
    }

    const isMonitored = path =>
        _.find(monitoredPaths, ({path: monitoredPath}) => monitoredPath === path)

    const toDir = path =>
        path.substr(-1) === '/' ? path : Path.join(path, '/')

    const monitor = path => {
        const absolutePath = getAbsolutePath(path)
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

module.exports = {
    createWatcher
}
