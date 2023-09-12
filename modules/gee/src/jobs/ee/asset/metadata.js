const {job} = require('#gee/jobs/job')

const worker$ = ({asset, allowedTypes}) => {
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

    const addBandNames = asset =>
        asset.bands
            ? {...asset, bandNames: asset.bands.map(({id}) => id)}
            : asset

    return ee.getAsset$(asset, 0).pipe(
        switchMap(asset => {
            const isAllowedType = !allowedTypes || (_.isArray(allowedTypes) && allowedTypes.includes(asset.type))
            if (isAllowedType) {
                return asset.type === 'ImageCollection'
                    ? addFirstImageBands$(asset)
                    : of(asset)
            } else {
                const prettyAllowedTypes = allowedTypes.join(', ')
                return throwError(() => new ClientException(`Asset is of type ${asset.type} while the only allowed types are: ${prettyAllowedTypes}.`, {
                    userMessage: {
                        message: 'Type not allowed',
                        key: 'gee.asset.error.wrongType',
                        args: {asset, allowedTypes: prettyAllowedTypes, actualType: asset.type}
                    }
                }))
            }
        }),
        map(addBandNames),
        catchError(handleError$)
    )
}

module.exports = job({
    jobName: 'EE asset metadata',
    jobPath: __filename,
    worker$
})
