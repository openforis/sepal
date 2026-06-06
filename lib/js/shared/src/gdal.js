import _ from 'lodash'
import {dirname} from 'path'
import {catchError, defer, filter, map, tap, throwError} from 'rxjs'
import {fileURLToPath} from 'url'

import {getLogger} from '#sepal/log'
import {swallow} from '#sepal/rxjs'
import {terminal$} from '#sepal/terminal'

const __dirname = dirname(fileURLToPath(import.meta.url))
const log = getLogger('gdal')

const createVrt$ = ({inputPaths, outputPath, args = []}) => defer(() => {
    const inputPathList = _.isArray(inputPaths) ? inputPaths : [inputPaths]
    return execute$(
        'gdalbuildvrt',
        'create VRT',
        [outputPath, ...args, ...inputPathList]
    ).pipe(swallow())
})

const getBandNames$ = path => defer(() => {
    return execute$(
        'python3',
        'get band names',
        [`${__dirname}/gdal/get_band_names.py`, path]
    ).pipe(
        filter(({stream}) => stream === 'stdout'),
        map(({value}) => JSON.parse(value))
    )
})

const setBandNames$ = (path, bandNames) => defer(() =>
    execute$(
        'python3',
        'set band names',
        [`${__dirname}/gdal/set_band_names.py`, path, ...bandNames]
    ).pipe(swallow())
)

const execute$ = (command, description, args = []) => {
    return terminal$(command, args).pipe(
        tap(({exitCode, stream, value}) => {
            if (exitCode)
                log.debug(msg(`Exit code ${exitCode}`))
            else if (stream === 'stdout')
                log.debug(msg(`stdout\n${value}`))
            else if (stream === 'stderr')
                log.warn(msg(`stderr\n${value}`))
        }),
        catchError(error => {
            log.error(msg(error))
            return throwError(() => new Error(`Failed to ${description}.`))
        })
    )
}

const msg = message => `GDAL: ${message}`

export {createVrt$, getBandNames$, setBandNames$}
