const {job} = require('#gee/jobs/job')

const worker$ = ({asset, expectedType}) => {
    const {of, catchError, forkJoin, map, switchMap, throwError} = require('rxjs')
    const {ClientException, NotFoundException} = require('#sepal/exception')
    const ee = require('#sepal/ee')
    const _ = require('lodash')

    const addFirstImageProperties$ = asset => {
        const collection = ee.ImageCollection(asset.id)
        const firstImage = collection
            .merge(ee.ImageCollection([ee.Image([])]))
            .first()
        const bands = firstImage.bandNames()
        const bands$ = ee.getInfo$(bands, 'Get collection bands')
        const firstImageProperties$ = ee.getInfo$(firstImage.toDictionary(), 'Get first image properties')

        const toImagePropertyTypes$ = () => {
            var propertyNames = firstImage.propertyNames()
            var firstImageProperties = firstImage.toDictionary(propertyNames)
            var imagePropertyTypes = ee.Dictionary.fromLists(
                firstImageProperties.keys(),
                firstImageProperties.values().map(ee.Algorithms.ObjectType)
            )
            return ee.getInfo$(imagePropertyTypes, 'Get first image property types')
        }
        return forkJoin({
            bands: bands$,
            imageProperties: firstImageProperties$,
            imagePropertyTypes: toImagePropertyTypes$()
        }).pipe(
            map(({bands, imageProperties, imagePropertyTypes}) => {
                const properties = {...imageProperties, ...asset.properties}
                return ({
                    ...asset,
                    properties,
                    imagePropertyTypes,
                    bands
                })
            }
            )
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
                    ? addFirstImageProperties$(asset)
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
