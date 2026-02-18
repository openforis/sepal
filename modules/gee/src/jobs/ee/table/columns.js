const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {tableId}
}) => {
    const ee = require('#sepal/ee/ee')
    const {ClientException, NotFoundException} = require('#sepal/exception')
    const {EEException} = require('#sepal/ee/exception')
    const {throwError, of, switchMap, catchError} = require('rxjs')

    const handleError$ = error =>
        ee.getAsset$(tableId, 0).pipe(
            catchError(() => of(null)),
            switchMap(asset =>
                throwError(
                    () => asset
                        ? asset.type === 'FeatureCollection'
                            ? new EEException(`Failed to load table columns from ${tableId}.`, {
                                cause: error,
                                userMessage: {
                                    message: 'Failed to load table',
                                    key: 'gee.error.earthEngineException',
                                    args: {earthEngineMessage: error},
                                }
                            })
                            : new ClientException('Asset is not a table', {
                                cause: error,
                                userMessage: {
                                    message: 'Not a table',
                                    key: 'gee.table.error.notATable',
                                    args: {tableId}
                                }
                            })
                        : new NotFoundException('Table not found ', {
                            cause: error,
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
        `load columns from ${tableId}`,
        0
    ).pipe(
        catchError(handleError$)
    )
}

module.exports = job({
    jobName: 'Get table columns',
    jobPath: __filename,
    worker$
})
