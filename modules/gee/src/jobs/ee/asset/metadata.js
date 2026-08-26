import _ from 'lodash'
import {catchError, forkJoin, map, of, switchMap, throwError} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {ClientException, NotFoundException} from '#sepal/exception'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {asset, allowedTypes, includeNominalScale}
}) => {

    // The bands of an ImageCollection are read from its first REAL member: mosaicking would report the identity
    // grid instead. Anything else reading per-band grids must use the same image, or it describes a different
    // one.
    const firstImageOf = assetId => ee.ImageCollection(assetId)
        .merge(ee.ImageCollection([ee.Image([])]))
        .first()

    const addFirstImageMetadata$ = asset => {
        const firstImage = firstImageOf(asset.id)
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
                : new NotFoundException(`Asset not found: ${asset}`, {
                    cause: error,
                    userMessage: {
                        message: `Asset not found: ${asset}`,
                        key: 'gee.asset.error.notFound',
                        args: {asset}
                    }
                })
        )

    const addBandNames = asset =>
        asset.bands
            ? {...asset, bandNames: asset.bands.map(({id}) => id)}
            : asset

    // Opt-in only, because it costs an evaluation that no existing caller needs. `nominalScale` is the one grid
    // fact the band records do not already carry in metres: `crs_transform` is expressed in the CRS's own units,
    // which for a geographic source are degrees.
    //
    // ONE evaluation for the whole asset - a dictionary of every selected band's scale - never one per band.
    const addNominalScale$ = asset => {
        const bands = asset.bands || []
        if (!includeNominalScale || !bands.length) {
            return of(asset)
        }
        const image = asset.type === 'ImageCollection' ? firstImageOf(asset.id) : ee.Image(asset.id)
        const bandNames = bands.map(({id}) => id)
        const nominalScales = ee.Dictionary.fromLists(
            bandNames,
            bandNames.map(bandName => image.select([bandName]).projection().nominalScale())
        )
        return ee.getInfo$(nominalScales, 'Get band nominal scales').pipe(
            map(scales => ({
                ...asset,
                bands: bands.map(band => ({...band, nominalScale: scales[band.id]}))
            })),
            // Enrichment is an extra, so failing it must leave the caller with ordinary, usable metadata rather
            // than reporting an asset that plainly exists as missing.
            catchError(() => of(asset))
        )
    }

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
        switchMap(addNominalScale$),
        map(addBandNames),
        catchError(handleError$)
    )
}

export default job({
    jobName: 'EE asset metadata',
    jobPath: fileName(import.meta.url),
    worker$
})
