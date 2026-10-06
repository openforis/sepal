import _ from 'lodash'
import Path from 'path'
import {catchError, concat, defer, EMPTY, from, ignoreElements, last, map, mergeMap, of, switchMap, throwError, toArray} from 'rxjs'

import ee from '#sepal/ee/ee'
import {currentEEContext} from '#sepal/ee/eeContext'
import tile from '#sepal/ee/tile'
import {ClientException} from '#sepal/exception'
import {
    AGREED,
    clearedEncodingProperties,
    CONFLICTING,
    encodingFromProperties,
    encodingProperties,
    encodingPropertyKeys,
    reconcileEncodings,
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
    crs,
    crsTransform,
    maxPixels,
    shardSize,
    properties,
    bandEncoding
}) => defer(() => {
    if (assetType === 'ImageCollection') {
        throw new Error('An ImageCollection asset is exported tile by tile, not as one image')
    }
    assertUserAccount()
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
                            crsTransform, maxPixels, shardSize, properties: exportProperties
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

// Prepares the collection before any tile is started: which tiles a resume keeps, whether those and the
// collection agree with this export's encoding, and the collection itself with its properties.
export const prepareImageCollection$ = ({image, description, assetId, strategy, region, tileSize, properties, bandEncoding}) => defer(() => {
    assertUserAccount()
    const encoding = bandEncoding || {}
    return carriedEncodingProperties$(image).pipe(
        switchMap(carried => assetDestination$(description, assetId && getProjectAssetId(assetId)).pipe(
            switchMap(({assetId}) => {
                // Settled before any tile is read or anything is written, so an encoding the tiles cannot store
                // stops the export even where the collection would state none.
                statedProperties(assetId, properties, encoding, carried)
                return ee.getInfo$(collectionTiles(region, tileSize).aggregate_array('system:index'), 'load tile ids').pipe(
                    switchMap(tileIds => retainedTiles$(assetId, strategy, tileIds).pipe(
                        switchMap(retained => {
                            assertRetainedTilesAgree(assetId, encoding, retained)
                            return concat(
                                createParentFolder$(assetId),
                                prepareCollection$({image, assetId, strategy, properties, encoding})
                            ).pipe(
                                last(null, null),
                                map(() => ({
                                    assetId,
                                    tiles: tileIds.map((tileId, tileIndex) => ({tileIndex, tileId, retained: Boolean(retained.get(tileIndex))}))
                                }))
                            )
                        })
                    ))
                )
            })
        ))
    )
})

export const startCollectionTileExport$ = ({
    image,
    description,
    assetId,
    pyramidingPolicy,
    dimensions,
    region,
    scale,
    crs,
    crsTransform,
    maxPixels,
    shardSize,
    tileSize,
    properties,
    bandEncoding
}, {tileIndex, tileId}) => defer(() => {
    assertUserAccount()
    return carriedEncodingProperties$(image).pipe(
        switchMap(carried => assetDestination$(description, assetId && getProjectAssetId(assetId)).pipe(
            switchMap(({description, assetId}) => imageToAsset$({
                image,
                description: `${description}_${tileIndex}`,
                assetId: `${assetId}/${tileIndex}`,
                strategy: 'resume',
                pyramidingPolicy,
                dimensions,
                region: collectionTiles(region, tileSize).filter(ee.Filter.eq('system:index', tileId)).geometry(),
                scale,
                crs,
                crsTransform,
                maxPixels,
                shardSize,
                properties: statedProperties(assetId, properties, bandEncoding || {}, carried)
            }))
        )),
        map(eeTaskId => ({eeTaskId}))
    )
})

const assertUserAccount = () => {
    if (currentEEContext().auth.type === 'serviceAccount') {
        throw new Error('Cannot export to asset using service account.')
    }
}

const collectionTiles = (region, tileSize) => tile(ee.FeatureCollection([ee.Feature(region)]), tileSize)

// What a resume would keep, read once: the tiles decide whether this export may resume at all, and the same
// readings then decide which tiles are missing.
const retainedTiles$ = (assetId, strategy, tileIds) => strategy === 'resume'
    ? from(tileIds.map((_tileId, tileIndex) => tileIndex)).pipe(
        mergeMap(tileIndex => ee.getAsset$(`${assetId}/${tileIndex}`, 0).pipe(
            map(asset => [tileIndex, asset]),
            // Absent, or a reading that did not succeed: neither states an encoding, and the tile's export
            // settles it either way.
            catchError(() => of([tileIndex, null]))
        ), 3),
        toArray(),
        map(readings => new Map(readings))
    )
    : of(new Map())

// Before the collection's properties are rewritten and before any tile is started, because a tile found to
// contradict this export on the last reading has to stop the first start.
const assertRetainedTilesAgree = (assetId, encoding, retained) => {
    const contradicts = asset =>
        asset && reconcileEncodings(encoding, encodingFromProperties(asset.properties)) === CONFLICTING
    if ([...retained.values()].some(contradicts)) {
        throw encodingConflict(assetId)
    }
}

const prepareCollection$ = ({image, assetId, strategy, properties, encoding}) =>
    ee.getAsset$(assetId).pipe(
        catchError(() => of(null)),
        switchMap(asset => {
            // Settled before anything is created, deleted, replaced or updated, so an encoding that cannot be
            // stored stops the export instead of being written as something else.
            const collectionProperties = statedProperties(assetId, properties, collectionEncoding({asset, assetId, strategy, encoding}))
            const prepare$ = asset && strategy === 'replace'
                ? replaceAsset$(asset, assetId)
                : asset
                    ? of(true)
                    : ee.createImageCollection$(assetId, {}, 1)
            return prepare$.pipe(
                last(null, null),
                switchMap(() => ee.getInfo$(image.toDictionary(), 'Extract image properties')),
                switchMap((imageProperties = {}) =>
                    ee.replaceAssetProperties$(
                        assetId,
                        {...withoutEncodingProperties(imageProperties), ...collectionProperties},
                        1
                    )
                )
            )
        }),
        ignoreElements()
    )

// Resumed collections keep their tiles, so the collection's encoding must describe those too. The tiles this run
// writes keep the encoding they are written with, whatever the collection can say about all of them.
const collectionEncoding = ({asset, assetId, strategy, encoding}) => {
    if (!asset || strategy === 'replace') {
        return encoding
    }
    const agreement = reconcileEncodings(encoding, encodingFromProperties(asset.properties))
    if (agreement === CONFLICTING) {
        throw encodingConflict(assetId)
    }
    // Uncertainty is not a conflict: a collection holding tiles this run cannot confirm states no encoding.
    return agreement === AGREED ? encoding : {}
}

const replaceAsset$ = (asset, assetId) => {
    const delete$ = asset.type === 'ImageCollection'
        ? ee.deleteAssetRecursive$(assetId, {include: ['ImageCollection', 'Image']})
        : asset.type === 'Image'
            ? ee.deleteAsset$(assetId, 1).pipe(catchError(() => EMPTY))
            : throwError(() => new Error(`Asset ${assetId} already exists, but isn't an image or image collection`))
    return concat(
        delete$,
        ee.createImageCollection$(assetId, {}, 1)
    )
}

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

const encodingConflict = assetId =>
    new ClientException(`Asset ${assetId} holds tiles written with a different band encoding`, {
        userMessage: {
            message: `The image collection ${assetId} already holds images stored with a different band encoding. Export with the Replace strategy instead of Resume.`,
            key: 'tasks.ee.export.asset.encodingConflict',
            args: {assetId}
        }
    })

const representationError = (assetId, reason, cause) =>
    new ClientException(`Cannot store the band encoding of ${assetId}: ${reason}`, {
        cause,
        userMessage: {
            message: `The band encoding of ${assetId} cannot be stored as Earth Engine asset metadata: ${reason}`,
            key: 'tasks.ee.export.asset.encodingTooLarge',
            args: {assetId, reason}
        }
    })

// The defaults of every asset export, a single image or a collection tile.
const imageToAsset$ = ({
    image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs = 'EPSG:4326', crsTransform,
    maxPixels = 1e13, shardSize = 256, properties
}) =>
    formatRegion$(region).pipe(
        switchMap(region => {
            const serverConfig = ee.batch.Export.convertToServerParams(
                // Earth Engine modifies the pyramidingPolicy it is given.
                _.cloneDeep({
                    image: image.set(properties), description, assetId, pyramidingPolicy, dimensions, region, scale, crs,
                    crsTransform: crsTransform || undefined, maxPixels, shardSize
                }),
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
