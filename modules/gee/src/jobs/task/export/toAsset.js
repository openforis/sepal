import _ from 'lodash'
import Path from 'path'
import {catchError, concat, defer, EMPTY, ignoreElements, last, map, of, switchMap} from 'rxjs'

import ee from '#sepal/ee/ee'
import {currentEEContext} from '#sepal/ee/eeContext'
import {ClientException} from '#sepal/exception'
import {
    clearedEncodingProperties,
    encodingProperties,
    encodingPropertyKeys,
    withoutEncodingProperties
} from '#sepal/recipe/output/bandEncoding'
import {swallow} from '#sepal/rxjs'

export const startImageToAssetExport$ = ({
    image,
    description,
    assetId,
    assetType,
    strategy,
    pyramidingPolicy,
    dimensions,
    region,
    scale,
    crs = 'EPSG:4326',
    crsTransform,
    maxPixels = 1e13,
    shardSize = 256,
    properties,
    bandEncoding
}) => defer(() => {
    if (assetType === 'ImageCollection') {
        throw new Error('Export to an ImageCollection asset is not supported yet')
    }
    if (currentEEContext().auth.type === 'serviceAccount') {
        throw new Error('Cannot export to asset using service account.')
    }
    const projectAssetId = assetId && getProjectAssetId(assetId)
    // What this export establishes about its own values, stated on everything it writes. Establishing nothing is
    // stated too: an encoding the image inherited describes what it was read from, not what is written here.
    const encoding = bandEncoding || {}
    return carriedEncodingProperties$(image).pipe(
        switchMap(carried => {
            const exportProperties = statedProperties(projectAssetId, properties, encoding, carried)
            return assetDestination$(description, projectAssetId).pipe(
                switchMap(({description, assetId}) =>
                    concat(
                        createParentFolder$(assetId),
                        imageToAsset$({
                            image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs,
                            crsTransform: crsTransform || undefined, maxPixels, shardSize, properties: exportProperties
                        }).pipe(
                            map(eeTaskId => ({eeTaskId, assetId}))
                        )
                    )
                )
            )
        }),
        last()
    )
})

// Which encoding properties the image already carries. Setting properties replaces the ones named and keeps
// the rest, so an inherited part survives unless it is named and cleared.
const carriedEncodingProperties$ = image =>
    ee.getInfo$(image.toDictionary(encodingPropertyKeys()), 'Read inherited band encoding').pipe(
        map(carried => Object.keys(carried || {}))
    )

const getProjectAssetId = id =>
    id.startsWith('users/')
        ? `projects/earthengine-legacy/assets/${id}`
        : id

const statedProperties = (assetId, properties, encoding, carried = []) => {
    const stated = statedEncoding(assetId, encoding)
    return {
        ...withoutEncodingProperties(properties),
        ...clearedEncodingProperties(carried, stated),
        ...stated
    }
}

// A batch export accepts an oversized property and completes with it silently missing, so an encoding that
// cannot be represented has to stop the export here.
const statedEncoding = (assetId, encoding) => {
    try {
        return encodingProperties(encoding)
    } catch (error) {
        throw representationError(assetId, error.message, error)
    }
}

const representationError = (assetId, reason, cause) =>
    new ClientException(`Cannot store the band encoding of ${assetId}: ${reason}`, {
        cause,
        userMessage: {
            message: `The band encoding of ${assetId} cannot be stored as Earth Engine asset metadata: ${reason}`,
            key: 'tasks.ee.export.asset.encodingTooLarge',
            args: {assetId, reason}
        }
    })

const imageToAsset$ = ({
    image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize, properties
}) =>
    formatRegion$(region).pipe(
        switchMap(region => {
            const serverConfig = ee.batch.Export.convertToServerParams(
                // Earth Engine modifies the pyramidingPolicy it is given.
                _.cloneDeep({image: image.set(properties), description, assetId, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize}),
                ee.data.ExportDestination.ASSET,
                ee.data.ExportType.IMAGE
            )
            const task = ee.batch.ExportTask.create(serverConfig)
            return concat(
                strategy === 'replace'
                    ? ee.deleteAssetRecursive$(assetId, {include: ['ImageCollection', 'Image']}).pipe(swallow())
                    : EMPTY,
                ee.startImageExport$(task, `exportImageToAsset(assetId: ${assetId}, description: ${description})`)
            )
        })
    )

const assetDestination$ = (description, assetId) => {
    if (!assetId && !description) {
        throw new Error('description or assetId must be specified')
    }
    description = description || Path.dirname(assetId)
    return assetId
        ? of({description, assetId})
        : ee.listBuckets$('projects/earthengine-legacy').pipe(
            map(({assets}) => {
                if (!assets || !assets.length) {
                    throw new Error('EE account has no asset roots')
                }
                return {description, assetId: Path.join(assets[0].id, description)}
            })
        )
}

const createParentFolder$ = assetId =>
    ee.createParentFolder$(assetId, 1).pipe(
        catchError(() => EMPTY),
        ignoreElements()
    )

const formatRegion$ = region =>
    ee.getInfo$(region.bounds(1), 'format region for export').pipe(
        map(geometry => ee.Geometry(geometry))
    )
