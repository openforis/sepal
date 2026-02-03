const {readFile, stat} = require('fs/promises')
const {from, of, catchError, map} = require('rxjs')

const fileToJson$ = path =>
    from(readFile(path, 'utf8')).pipe(
        map(s => JSON.parse(s))
    )

const lastModifiedDate$ = path =>
    from(stat(path)).pipe(
        map(stats => stats.mtime),
        catchError(() => of(null))
    )

module.exports = {fileToJson$, lastModifiedDate$}
