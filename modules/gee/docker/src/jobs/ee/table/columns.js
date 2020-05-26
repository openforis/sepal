const job = require('root/jobs/job')

const worker$ = ({tableId}) => {
    const ee = require('ee')
    const {Exception, NotFoundException} = require('sepal/exception')
    const {EEException} = require('sepal/ee/exception')
    const {throwError, of} = require('rxjs')
    const {switchMap, catchError} = require('rxjs/operators')

    const handleError$ = error =>
        ee.getAsset$(tableId, 0).pipe(
            catchError(() => of(null)),
            switchMap(asset =>
                throwError(
                    asset
                        ? asset.type === 'FeatureCollection'
                            ? new EEException({
                                error,
                                userMessage: {
                                    message: `Failed to load table columns from ${tableId}.`,
                                    key: 'gee.error.earthEngineException',
                                    args: {earthEngineMessage: error},
                                }
                            })
                            : new Exception({
                                error,
                                userMessage: {
                                    message: 'Not a table',
                                    key: 'gee.table.error.notATable',
                                    args: {tableId}
                                }
                            })
                        : new NotFoundException({
                            error,
                            userMessage: {
                                message: 'Table not found',
                                key: 'gee.table.error.notFound',
                                args: {tableId}
                            }
                        })
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
