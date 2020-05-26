const job = require('root/jobs/job')

const worker$ = ({tableId}) => {
    const ee = require('ee')
    const {Exception, NotFoundException} = require('sepal/exception')
    const {EEException} = require('sepal/ee/exception')
    const {throwError, of} = require('rxjs')
    const {switchMap, catchError} = require('rxjs/operators')

    const handleError$ = cause =>
        ee.getAsset$(tableId, 0).pipe(
            catchError(() => of()),
            switchMap(asset =>
                throwError(
                    asset
                        ? asset.type === 'FeatureCollection'
                            ? new EEException(cause, `Failed to load table columns from ${tableId}.`)
                            : new Exception(cause, 'Not a table', 'gee.table.error.notATable', {tableId})
                        : new NotFoundException(cause, 'Not found', 'gee.table.error.notFound', {tableId})
                )
            )
        )

    return ee.getInfo$(
        ee.FeatureCollection(tableId)
            .first()
            .propertyNames()
            .sort(),
        'columns',
        0
    ).pipe(
        catchError(handleError$)
    )
}

module.exports = job({
    jobName: 'Get table columns',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: ctx => [ctx.request.query],
    worker$
})
