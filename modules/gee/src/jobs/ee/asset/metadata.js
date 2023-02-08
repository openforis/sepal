const {job} = require('#gee/jobs/job')

const worker$ = ({asset, expectedType}) => {
    const {of, catchError, map, switchMap, throwError} = require('rxjs')
    const {ClientException, NotFoundException} = require('#sepal/exception')
    const ee = require('#sepal/ee')
    const _ = require('lodash')

    const addFirstImageBands$ = asset => {
        const collection = ee.ImageCollection(asset.id)
        const bands = ee.Algorithms.If(
            collection.size(),
            ee.Dictionary(ee.Algorithms.Describe(
                collection.first()
            )).get('bands'),
            []
        )
        return ee.getInfo$(bands, 'Get collection bands').pipe(
            map(bands => ({...asset, bands}))
        )
    }
    
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
        switchMap(asset => {
            if (!expectedType || asset.type === expectedType || (_.isArray(expectedType) && expectedType.includes(asset.type))) {
                return asset.type === 'ImageCollection'
                    ? addFirstImageBands$(asset)
                    : of(asset)
            } else {
                return throwError(() => new ClientException(`Asset is of type ${asset.type} while ${expectedType} is expected.`, {
                    userMessage: {
                        message: `Not an ${expectedType}`,
                        key: 'gee.asset.error.wrongType',
                        args: {asset, expectedType, actualType: asset.type}
                    }
                }))
            }
        }),
        catchError(handleError$)
    )
}

module.exports = job({
    jobName: 'EE asset metadata',
    jobPath: __filename,
    worker$
})
