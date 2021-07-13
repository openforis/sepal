const {readFile} = require('fs')
const {stat} = require('fs/promises')
const {Subject, from, of} = require('rxjs')
const {catchError, map} = require('rxjs/operators')

const fileToJson$ = path => {
    const json$ = new Subject()
    readFile(path, 'utf8', (error, s) => {
        if (error) {
            json$.error(error)
        } else {
            try {
                json$.next(JSON.parse(s))
                json$.complete()
            } catch (e) {
                json$.error(e)
            }
        }
    })
    return json$
}

const lastModifiedDate$ = path => {
    return from(stat(path)).pipe(
        map(stats => stats.mtime),
        catchError(() => of(null))
    )
}

module.exports = {fileToJson$, lastModifiedDate$}
