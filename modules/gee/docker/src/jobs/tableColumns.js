const log = require('../log')
const job = require('../job')
const eeAuth = require('./eeAuth')

const worker$ = ({tableId}) => {
    const ee = require('@google/earthengine')
    const {getAsset$, getInfo$} = require('./eeUtils')
    const {Exception, SystemException, NotFoundException} = require('../exception')
    const {throwError} = require('rxjs')
    const {switchMap, catchError} = require('rxjs/operators')

    log.info(`Get columns for table: ${tableId}`)

    const handleError$ = cause =>
        getAsset$(tableId).pipe(
            switchMap(asset =>
                throwError(
                    asset
                        ? asset.type === 'FeatureCollection'
                            ? new SystemException(cause, 'Failed to load table columns', {tableId})
                            : new Exception(cause, 'Not a table', 'gee.table.error.notATable', {tableId})
                        : new NotFoundException(cause, 'Not found', 'gee.table.error.notFound', {tableId})
                )
            )
        )

    return getInfo$(
        ee.FeatureCollection(tableId)
            .first()
            .propertyNames()
            .sort()
    ).pipe(
        catchError(handleError$)
    )
}

module.exports = job({
    jobName: 'Get table columns',
    jobPath: __filename,
    before: [eeAuth],
    worker$
})
