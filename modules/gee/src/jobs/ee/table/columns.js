import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {ClientException, NotFoundException} from '#sepal/exception'
import {EEException} from '#sepal/ee/exception'
import {throwError, of, switchMap, catchError} from 'rxjs'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)

const worker$ = ({
    requestArgs: {tableId}
}) => {

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

export default job({
    jobName: 'Get table columns',
    jobPath: __filename,
    worker$
})
