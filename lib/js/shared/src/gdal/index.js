const {throwError} = require('rxjs')
const {catchError, tap} = require('rxjs/operators')
const {swallow} = require('sepal/operators')
const log = require('sepal/log').getLogger('gdal')
const {terminal$} = require('sepal/terminal')
const _ = require('lodash')


const createVrt$ = ({inputPaths, outputPath, args = []}) => {
    const inputPathList = _.isArray(inputPaths) ? inputPaths : [inputPaths]
    return execute$(
        'gdalbuildvrt',
        'create VRT',
        [outputPath, ...args, ...inputPathList]
    )
}

const setBandNames$ = ({path, bandNames}) =>
    execute$(
        'python3', 'set band names',
        [`${__dirname}/set_band_metadata.py`, path, 'Description', ...bandNames]
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
        swallow(),
        catchError(error => {
            log.error(msg(error))
            return throwError(new Error(`Failed to ${description}.`))
        })
    )
}

const msg = message => `GDAL: ${message}`

module.exports = {createVrt$, setBandNames$}