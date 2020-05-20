const {from, of} = require('rxjs')
const {catchError, concatAll, filter, map, switchMap, tap} = require('rxjs/operators')
const fs = require('fs')
const Path = require('path')

const ls$ = (path, options = {}) =>
    from(fs.promises.readdir(path, options))

const mkdir$ = (path, options = {}) =>
    from(fs.promises.mkdir(path, options)).pipe(
        map(() => path)
    )

const exists$ = path =>
    from(fs.promises.stat(path)).pipe(
        catchError(() => of(null)),
        map(stat => !!stat)
    )

const getPostfixIndex = (name, preferredName) => {
    const match = name.match(new RegExp(`^${preferredName}_(\\d)$`))
    return match && match[1]
        ? parseInt(match[1]) + 1
        : 1
}

const mkdirSafe$ = (preferredPath, options = {}) => {
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
}

module.exports = {ls$, mkdir$, mkdirSafe$}