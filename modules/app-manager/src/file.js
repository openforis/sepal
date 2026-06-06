import {readFile, stat} from 'fs/promises'
import {catchError, from, map, of} from 'rxjs'

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
