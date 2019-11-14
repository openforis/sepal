// const log = require('@sepal/log')
const {job} = require('@sepal/job')
const eeAuth = require('@sepal/ee/auth')

const worker$ = ({tableId}) => {
    const ee = require('@google/earthengine')
    const {getAsset$, getInfo$} = require('@sepal/ee/utils')
    const {Exception, SystemException, NotFoundException} = require('@sepal/exception')
    const {throwError, of} = require('rxjs')
    const {switchMap, catchError} = require('rxjs/operators')

    const handleError$ = cause =>
        getAsset$(tableId).pipe(
            catchError(() => of()),
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
