const {defer, of, catchError, map, switchMap} = require('rxjs')
const {fromPromise} = require('#sepal/rxjs')
const fs = require('fs')
const Path = require('path')

const ls$ = (path, options = {}) => defer(() =>
    fromPromise(fs.promises.readdir(path, options))
)

const mkdir$ = (path, options = {}) => defer(() =>
    fromPromise(fs.promises.mkdir(path, options)).pipe(
        map(() => path)
    )
)

const exists$ = path => defer(() =>
    fromPromise(fs.promises.stat(path)).pipe(
        catchError(() => of(null)),
        map(stat => !!stat)
    )
)

const getPostfixIndex = (name, preferredName) => {
    const match = name.match(new RegExp(`^${preferredName}_(\\d)$`))
    return match && match[1]
        ? parseInt(match[1]) + 1
        : 1
}

const mkdirSafe$ = (preferredPath, options = {}) => defer(() => {
    const preferredName = Path.basename(preferredPath)
    const parent = Path.dirname(preferredPath)
    const mkdirPostfix$ = () => ls$(parent).pipe(
        map(names => names
            .filter(name => name.startsWith(preferredName))
            .map(name => getPostfixIndex(name, preferredName))
        ),
        map(postfixIndexes => Math.max(...postfixIndexes)),
        switchMap(postfixIndex =>
            mkdir$(Path.join(parent, `${preferredName}_${postfixIndex}`), options))
    )
    return exists$(preferredPath).pipe(
        switchMap(exists => exists
            ? mkdirPostfix$()
            : mkdir$(preferredPath, options)
        )
    )
})

const createLock$ = dir => {
    const lockPath = Path.join(dir, '.task_pending')
    return defer(() =>
        fromPromise(fs.promises.writeFile(lockPath, '')).pipe(
            map(() => lockPath)
        )
    )
}

const releaseLock$ = dir => {
    const lockPath = Path.join(dir, '.task_pending')
    return defer(() =>
        fromPromise(fs.promises.unlink(lockPath)).pipe(
            map(() => lockPath),
            catchError(() => of(null))
        )
    )
}

module.exports = {exists$, ls$, mkdir$, mkdirSafe$, createLock$, releaseLock$}
