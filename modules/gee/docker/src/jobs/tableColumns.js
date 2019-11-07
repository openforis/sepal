const log = require('../log')
const job = require('../job')
const eeAuth = require('./eeAuth')

const worker$ = ({tableId}) => {
    const ee = require('@google/earthengine')
    const {getAsset$, getInfo$} = require('./eeUtils')
    const {Exception, SystemException, NotFoundException} = require('../exception')
    const {of, throwError} = require('rxjs')
    const {switchMap, catchError} = require('rxjs/operators')

    log.info(`Get columns for table: ${tableId}`)

    return getInfo$(
        ee.FeatureCollection(tableId)
            .first()
            .propertyNames()
            .sort()
    ).pipe(
        catchError(cause =>
            getAsset$(tableId).pipe(
                catchError(() => of()),
                switchMap(asset =>
                    throwError(
                        asset
                            ? asset.type === 'FeatureCollection'
                                ? new SystemException(cause, 'Failed to load table columns', 'foo')
                                : new Exception(cause, 'Not a table', 'gee.table.error.notATable', {tableId})
                            : new NotFoundException(cause, 'Not found', 'gee.table.error.notFound', {tableId})
                    )
                )
            )
        )
    )
}

module.exports = job({
    jobName: 'Get table columns',
    jobPath: __filename,
    before: [eeAuth],
    worker$
})
