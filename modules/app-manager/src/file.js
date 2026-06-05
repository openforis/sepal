import {readFile, stat} from 'fs/promises'
import {from, of, catchError, map} from 'rxjs'

const fileToJson$ = path =>
    from(readFile(path, 'utf8')).pipe(
        map(s => JSON.parse(s))
    )

const lastModifiedDate$ = path =>
    from(stat(path)).pipe(
        map(stats => stats.mtime),
        catchError(() => of(null))
    )

export {fileToJson$, lastModifiedDate$}
