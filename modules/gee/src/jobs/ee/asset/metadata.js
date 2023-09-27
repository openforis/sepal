const {job} = require('#gee/jobs/job')

const worker$ = ({asset, allowedTypes}) => {
    const {of, catchError, forkJoin, map, switchMap, throwError} = require('rxjs')
    const {ClientException, NotFoundException} = require('#sepal/exception')
    const ee = require('#sepal/ee')
    const _ = require('lodash')

    const addFirstImageMetadata$ = asset => {
        const collection = ee.ImageCollection(asset.id)
        const firstImage = collection
            .merge(ee.ImageCollection([ee.Image([])]))
            .first()
        const bands$ = ee.getInfo$(firstImage, 'Get first image in collection').pipe(
            map(({bands}) => bands)
        )
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

    const addBandNames = asset =>
        asset.bands
            ? {...asset, bandNames: asset.bands.map(({id}) => id)}
            : asset

    return ee.getAsset$(asset, 0).pipe(
        switchMap(asset => {
            const isAllowedType = !allowedTypes || (_.isArray(allowedTypes) && allowedTypes.includes(asset.type))
            if (isAllowedType) {
                return asset.type === 'ImageCollection'
                    ? addFirstImageMetadata$(asset)
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
