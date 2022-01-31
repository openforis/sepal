const {job} = require('gee/jobs/job')

const worker$ = ({asset, expectedType}) => {
    const {throwError, of, catchError, switchMap} = require('rxjs')
    const {ClientException, NotFoundException} = require('sepal/exception')
    const ee = require('sepal/ee')

    const handleError$ = error =>
        throwError(
            () => error instanceof ClientException
                ? error
                : new NotFoundException('Asset not found.', {
                    cause: error,
                    userMessage: {
                        message: 'Asset not found',
                        key: 'gee.asset.error.notFound',
                        args: {asset}
                    }
                })
        )

    return ee.getAsset$(asset, 0).pipe(
        switchMap(asset =>
            asset.type === expectedType
                ? of(asset)
                : throwError(new ClientException(`Asset is of type ${asset.type} while ${expectedType} is expected.`, {
                    userMessage: {
                        message: `Not an ${expectedType}`,
                        key: 'gee.asset.error.wrongType',
                        args: {asset, expectedType, actualType: asset.type}
                    }
                }))
        ),
        catchError(handleError$)
    )
}

module.exports = job({
    jobName: 'EE asset metadata',
    jobPath: __filename,
    worker$
})
