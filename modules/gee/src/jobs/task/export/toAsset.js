import Path from 'node:path'

import _ from 'lodash'
import {catchError, concat, defer, EMPTY, forkJoin, from, ignoreElements, last, map, mergeMap, of, switchMap, throwError, toArray} from 'rxjs'

import ee from '#sepal/ee/ee'
import {isServiceAccount} from '#sepal/ee/eeContext'
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

import {assertRegressionCompatible, listRegressionAssets$, readExportAsset$, regressionCompatibility$, regressionProperties} from './regressionCompatibility.js'

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
    bandEncoding,
    regressionPrecision
}) => defer(() => {
    if (assetType === 'ImageCollection') {
        throw new Error('An ImageCollection asset is exported tile by tile, not as one image')
    }
    assertUserAccount()
    const projectAssetId = assetId && getProjectAssetId(assetId)
    // What this export establishes about its own values, stated on everything it writes. Establishing nothing is
    // stated too: an encoding the image inherited describes what it was read from, not what is written here.
    const encoding = bandEncoding || {}
    return forkJoin({carried: carriedEncodingProperties$(image), compatibility: regressionCompatibility$(image, regressionPrecision)}).pipe(
        switchMap(({carried, compatibility}) => {
            const exportProperties = statedProperties(projectAssetId, properties, encoding, carried, compatibility)
            return assetDestination$(description, projectAssetId).pipe(
                switchMap(({description, assetId}) => (compatibility && strategy === 'resume'
                    ? readExportAsset$(assetId, compatibility)
                    : of(null)).pipe(
                    switchMap(asset => {
                        assertRegressionCompatible(assetId, asset, compatibility)
                        return concat(
                            createParentFolder$(assetId),
                            imageToAsset$({
                                image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs,
                                crsTransform, maxPixels, shardSize, properties: exportProperties
                            }).pipe(
                                map(eeTaskId => ({eeTaskId, assetId}))
                            )
                        )
                    })
                ))
            )
        }),
        last()
    )
})

export const startTableToAssetExport$ = ({collection, description, assetId, strategy}) => defer(() => {
    assertUserAccount()
    const serverConfig = ee.batch.Export.convertToServerParams(
        _.cloneDeep({collection, description, assetId}),
        ee.data.ExportDestination.ASSET,
        ee.data.ExportType.TABLE
    )
    const task = ee.batch.ExportTask.create(serverConfig)
    return concat(
        createParentFolder$(assetId),
        strategy === 'replace'
            ? ee.deleteAssetRecursive$(assetId, {include: ['ImageCollection', 'Image', 'Table']}).pipe(swallow())
            : EMPTY,
        ee.startTableExport$(task, `exportTableToAsset(assetId: ${assetId}, description: ${description})`).pipe(
            map(eeTaskId => ({eeTaskId}))
        )
    )
})

// Prepares the collection before any tile is started: which tiles a resume keeps, whether those and the
// collection agree with this export's encoding, and the collection itself with its properties.
export const prepareImageCollection$ = ({image, description, assetId, strategy, region, tileSize, properties, bandEncoding, regressionPrecision}) => defer(() => {
    assertUserAccount()
    const encoding = bandEncoding || {}
    return forkJoin({carried: carriedEncodingProperties$(image), compatibility: regressionCompatibility$(image, regressionPrecision)}).pipe(
        switchMap(({carried, compatibility}) => assetDestination$(description, assetId && getProjectAssetId(assetId)).pipe(
            switchMap(({assetId}) => {
                statedProperties(assetId, properties, encoding, carried, compatibility)
                return checkedCollection$({assetId, strategy, region, tileSize, encoding, compatibility}).pipe(
                    switchMap(({asset, tileIds, retained}) => {
                        const collectionProperties = statedProperties(assetId, properties, collectionEncoding({asset, assetId, strategy, encoding}), [], compatibility)
                        return concat(
                            createParentFolder$(assetId),
                            prepareCollection$({image, assetId, strategy, asset, collectionProperties})
                        ).pipe(
                            last(null, null),
                            map(() => ({
                                assetId,
                                tiles: tileIds.map((tileId, tileIndex) => ({tileIndex, tileId, retained: Boolean(retained.get(getProjectAssetId(`${assetId}/${tileIndex}`)))}))
                            }))
                        )
                    })
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
    bandEncoding,
    regressionPrecision
}, {tileIndex, tileId}) => defer(() => {
    assertUserAccount()
    return forkJoin({carried: carriedEncodingProperties$(image), compatibility: regressionCompatibility$(image, regressionPrecision)}).pipe(
        switchMap(({carried, compatibility}) => assetDestination$(description, assetId && getProjectAssetId(assetId)).pipe(
            switchMap(({description, assetId}) => (compatibility
                ? checkedTile$({assetId, tileIndex, encoding: bandEncoding || {}, compatibility})
                : of(null)).pipe(
                switchMap(() => imageToAsset$({
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
                    properties: statedProperties(assetId, properties, bandEncoding || {}, carried, compatibility)
                }))
            ))
        )),
        map(eeTaskId => ({eeTaskId}))
    )
})

const assertUserAccount = () => {
    if (isServiceAccount()) {
        throw new Error('Cannot export to asset using service account.')
    }
}

const collectionTiles = (region, tileSize) => tile(ee.FeatureCollection([ee.Feature(region)]), tileSize)

// What a resume would keep, read once: the tiles decide whether this export may resume at all, and the same
// readings then decide which tiles are missing.
const retainedTiles$ = (assetId, strategy, tileIds) => strategy === 'resume'
    ? from(tileIds.map((_tileId, tileIndex) => tileIndex)).pipe(
        mergeMap(tileIndex => readExportAsset$(`${assetId}/${tileIndex}`).pipe(
            map(asset => [getProjectAssetId(`${assetId}/${tileIndex}`), asset])
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

const checkedCollection$ = ({assetId, strategy, region, tileSize, encoding, compatibility}) =>
    readExportAsset$(assetId, compatibility).pipe(
        switchMap(asset => {
            if (strategy !== 'replace') {
                assertRegressionCompatible(assetId, asset, compatibility, {collection: true})
                collectionEncoding({asset, assetId, strategy, encoding})
            }
            return ee.getInfo$(collectionTiles(region, tileSize).aggregate_array('system:index'), 'load tile ids').pipe(
                switchMap(tileIds => (compatibility
                    ? regressionTiles$({assetId, asset, strategy, compatibility})
                    : retainedTiles$(assetId, strategy, tileIds)).pipe(
                    map(retained => {
                        assertRetainedTilesAgree(assetId, encoding, retained)
                        for (const [id, tile] of retained) {
                            assertRegressionCompatible(id, tile, compatibility)
                        }
                        return {asset, tileIds, retained}
                    })
                ))
            )
        })
    )

const checkedTile$ = ({assetId, tileIndex, encoding, compatibility}) =>
    readExportAsset$(assetId, compatibility, {allowAbsent: false}).pipe(
        switchMap(asset => {
            assertRegressionCompatible(assetId, asset, compatibility, {required: true, collection: true})
            collectionEncoding({asset, assetId, strategy: 'resume', encoding})
            const destination = `${assetId}/${tileIndex}`
            return readExportAsset$(destination, compatibility, {parentCollection: assetId}).pipe(
                map(tile => {
                    assertRetainedTilesAgree(assetId, encoding, new Map([[destination, tile]]))
                    assertRegressionCompatible(destination, tile, compatibility)
                    return tile
                })
            )
        })
    )

const regressionTiles$ = ({assetId, asset, strategy, compatibility}) => asset && strategy !== 'replace'
    ? listRegressionAssets$(assetId).pipe(
        catchError(error => throwError(() => new ClientException(`Cannot read retained regression tiles of ${assetId}. Retry, or use a fresh destination or Replace.`, {cause: error}))),
        switchMap(assets => from(assets).pipe(
            mergeMap(record => {
                const id = record.name || record.id
                return readExportAsset$(id, compatibility, {allowAbsent: false}).pipe(
                    map(tile => [getProjectAssetId(id), tile])
                )
            }, 3),
            toArray(),
            map(tiles => new Map(tiles))
        ))
    )
    : of(new Map())

const prepareCollection$ = ({image, assetId, strategy, asset, collectionProperties}) => {
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
        ),
        ignoreElements()
    )
}

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

const statedProperties = (assetId, properties, encoding, carried = [], compatibility) => {
    const stated = statedEncoding(assetId, encoding)
    return {
        ...withoutEncodingProperties(properties),
        ...clearedEncodingProperties(carried, stated),
        ...stated,
        ...regressionProperties(compatibility)
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
    image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs, crsTransform,
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
