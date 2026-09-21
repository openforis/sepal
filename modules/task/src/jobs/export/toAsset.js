import _ from 'lodash'
import Path from 'path'
import {catchError, concat, defer, EMPTY, from, last, map, mergeMap, of, scan, switchMap, tap, throwError, toArray} from 'rxjs'

import ee from '#sepal/ee/ee'
import tile from '#sepal/ee/tile'
import {ClientException} from '#sepal/exception'
import * as http from '#sepal/httpClient'
import {getLogger} from '#sepal/log'
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
import {task$} from '#task/ee/task'
import {exportLimiter$} from '#task/jobs/service/exportLimiter'
import {progress} from '#task/rxjs/operators'

const log = getLogger('task')

const exportImageToAsset$ = (taskId, {
    image,
    description,
    assetId,
    assetType,
    sharing,
    strategy,
    pyramidingPolicy,
    dimensions,
    region,
    scale,
    crs = 'EPSG:4326',
    crsTransform,
    maxPixels = 1e13,
    shardSize = 256,
    tileSize,
    properties,
    bandEncoding,
    retries = 0,
}) => {
    assetId = getProjectAssetId(assetId) // Get rid of legacy assetId format
    crsTransform = crsTransform || undefined
    region = region || image.geometry()
    if (ee.sepal.getAuthType() === 'SERVICE_ACCOUNT')
        throw new Error('Cannot export to asset using service account.')
    // What this export establishes about its own values, stated on everything it writes. Establishing nothing is
    // stated too: an encoding the image inherited describes what it was read from, not what is written here.
    const encoding = bandEncoding || {}
    return carriedEncodingProperties$(image).pipe(switchMap(carried => {
        const exportProperties = statedProperties(assetId, properties, encoding, carried)
        const export$ = ({description, assetId}) => assetType === 'ImageCollection'
            ? imageToAssetCollection$(taskId, {
                image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize, tileSize, properties: exportProperties, encoding, retries
            })
            : imageToAsset$(taskId, {
                image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize, properties: exportProperties, retries
            })
        return assetDestination$(description, assetId).pipe(
            switchMap(({description, assetId}) =>
                concat(
                    createParentFolder$(assetId),
                    export$({description, assetId}),
                    share$({sharing, assetId})
                )
            ))
    }))
}

// Which encoding properties the image already carries, read once for the image and every tile built from it.
// Setting properties replaces the ones named and keeps the rest, so an inherited part survives unless it is
// named and cleared. Bounded by the format, so this is one read whatever the image holds.
const carriedEncodingProperties$ = image =>
    ee.getInfo$(image.toDictionary(encodingPropertyKeys()), 'Read inherited band encoding').pipe(
        map(carried => Object.keys(carried || {}))
    )

const getProjectAssetId = id =>
    id.startsWith('users/')
        ? `projects/earthengine-legacy/assets/${id}`
        : id

// This export's own encoding stated in full, in place of whatever the image carried: what it states, and null
// for every encoding property on the image that this one does not replace.
const statedProperties = (assetId, properties, encoding, carried = []) => {
    const stated = statedEncoding(assetId, encoding)
    return {
        ...withoutEncodingProperties(properties),
        ...clearedEncodingProperties(carried, stated),
        ...stated
    }
}

// The codec keeps every part within one property's limit and refuses an entry or a part count it cannot
// represent. That refusal has to stop the export: a batch export accepts an oversized property and completes
// with it silently missing, leaving the asset claiming an encoding it was not written with.
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

const imageToAssetCollection$ = (taskId, {
    image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize, tileSize, properties, encoding, retries
}) => {
    const tileFeatures = tile(ee.FeatureCollection([ee.Feature(region)]), tileSize)

    const replaceAsset$ = asset => {
        const delete$ = () => asset.type === 'ImageCollection'
            ? ee.deleteAssetRecursive$(assetId, {include: ['ImageCollection', 'Image']})
            : asset.type === 'Image'
                ? deleteAsset$(assetId)
                : throwError(() => 'Asset ID already exists, but isn\'t an image or image collection')
        return concat(
            delete$(),
            ee.createImageCollection$(assetId, {}, 1)
        )
    }

    // Resumed collections keep their tiles, so the collection's encoding must describe those too. The tiles this
    // run writes keep the encoding they are written with, whatever the collection can say about all of them.
    const collectionEncoding = asset => {
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

    const prepareCollection$ = () => {
        return ee.getAsset$(assetId).pipe(
            catchError(() => of(null)),
            switchMap(asset => {
                // Settled before anything is created, deleted, replaced or updated, so an encoding that cannot
                // be stored stops the export instead of being written as something else.
                const collectionProperties = statedProperties(assetId, properties, collectionEncoding(asset))

                const prepare$ = asset && strategy === 'replace'
                    ? replaceAsset$(asset)
                    : asset
                        ? of(true)
                        : ee.createImageCollection$(assetId, {}, 1)
                return prepare$.pipe(
                    last(),
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
            swallow()
        )
    }
    
    // What a resume would keep, read once and kept: the tiles decide whether this export may resume at all, and
    // the same readings then decide which tiles are missing. Nothing else reads them.
    const retainedTiles$ = tileIds => strategy === 'resume'
        ? from(tileIds.map((_tileId, tileIndex) => tileIndex)).pipe(
            mergeMap(tileIndex => ee.getAsset$(`${assetId}/${tileIndex}`, 0).pipe(
                map(asset => [tileIndex, asset]),
                // Absent, or a reading that did not succeed: neither states an encoding, and the export attempt
                // settles it either way. A refusal is never reached from here.
                catchError(() => of([tileIndex, null]))
            ), 3),
            toArray(),
            map(readings => new Map(readings))
        )
        : of(new Map())

    // Before the collection's properties are rewritten and before any tile is submitted, because a tile found
    // to contradict this export on the last reading has to stop the first submission.
    const assertRetainedTilesAgree = retained => {
        const contradicts = asset =>
            asset && reconcileEncodings(encoding, encodingFromProperties(asset.properties)) === CONFLICTING
        if ([...retained.values()].some(contradicts)) {
            throw encodingConflict(assetId)
        }
    }

    const tilesToAssets$ = (tileIds, retained) => {
        const export$ = of(tileIds).pipe(
            switchMap(tileIds => {
                const tileCount = tileIds.length
                const startingExport$ = of(true).pipe(progress({
                    defaultMessage: `Start export of ${tileCount} tiles`,
                    messageKey: 'tasks.ee.export.asset.startExport',
                    messageArgs: {tileCount}
                }))
                const export$ = exportTiles$(tileIds, retained).pipe(
                    tap(progress => log.trace(() => `collection-export: ${JSON.stringify(progress)}`)),
                    scan(
                        (acc, progress) => {
                            return ({
                                ...acc,
                                ...progress,
                                completedTiles: progress.completedTiles === undefined
                                    ? acc.completedTiles + (progress.completedTile ? 1 : 0)
                                    : progress.completedTiles
                            })
                        },
                        {completedTiles: 0}
                    ),
                    map(progress => toProgress(progress, tileIds.length))
                )
                return concat(
                    startingExport$,
                    export$
                )
            })
        )
        return export$
    }

    const exportTiles$ = (tileIds, retained) => {
        const tile$ = from(
            tileIds.map((tileId, tileIndex) =>
                ({tileId, tileIndex})
            )
        )
        return tile$.pipe(
            mergeMap(({tileId, tileIndex}) => exportTile$({tileId, tileIndex, retained}), 3)
        )
    }

    const exportTile$ = ({tileId, tileIndex, retained}) => {
        const tileAssetId = `${assetId}/${tileIndex}`
        const tileGeometry = tileFeatures
            .filter(ee.Filter.eq('system:index', tileId))
            .geometry()
        const export$ = () => imageToAsset$(taskId, {
            image,
            description: `${description}_${tileIndex}`,
            assetId: tileAssetId,
            strategy: 'resume',
            pyramidingPolicy,
            dimensions,
            region: tileGeometry,
            scale,
            crs, crsTransform,
            maxPixels,
            shardSize,
            properties,
            retries
        })
        return concat(
            retained.get(tileIndex) ? EMPTY : export$(), // Export what the retained readings did not find
            of({completedTile: true})
        )
    }

    const toProgress = ({completedTiles = 0}, totalTiles) => ({
        completedTiles,
        defaultMessage: `Exported ${completedTiles} of out of ${totalTiles} tiles.`,
        messageKey: 'tasks.retrieve.collection_to_asset.progress',
        messageArgs: {completedTiles, totalTiles}
    })
    const prepareProgress$ = of(true).pipe(progress({
        defaultMessage: `Prepare image collection '${assetId}'`,
        messageKey: 'tasks.ee.export.asset.prepareImageCollection',
        messageArgs: {assetId}
    }))
    const tilingProgress$ = of(true).pipe(progress({
        defaultMessage: 'Tiling image',
        messageKey: 'tasks.ee.export.asset.tilingImage'
    }))
    const tileIds$ = ee.getInfo$(tileFeatures.aggregate_array('system:index'), 'load tile ids')
    return concat(
        prepareProgress$,
        tilingProgress$,
        tileIds$.pipe(
            switchMap(tileIds => retainedTiles$(tileIds).pipe(
                switchMap(retained => {
                    assertRetainedTilesAgree(retained)
                    return concat(
                        prepareCollection$(),
                        tilesToAssets$(tileIds, retained)
                    )
                })
            ))
        )
    )
}

const imageToAsset$ = (taskId, {
    image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize, properties, retries
}) => {
    const exportToAsset$ = ({task, description, assetId, _retries}) => {
        return exportLimiter$(
            concat(
                strategy === 'replace'
                    ? ee.deleteAssetRecursive$(assetId, {include: ['ImageCollection', 'Image']}).pipe(swallow())
                    : of(),
                task$(taskId, task, description)
            )
        )
    }
    return formatRegion$(region).pipe(
        switchMap(region => {
            const serverConfig = ee.batch.Export.convertToServerParams(
                _.cloneDeep({image: image.set(properties), description, assetId, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize}), // It seems like EE modifies the pyramidingPolicy
                ee.data.ExportDestination.ASSET,
                ee.data.ExportType.IMAGE
            )
            const task = ee.batch.ExportTask.create(serverConfig)
            return exportToAsset$({
                task,
                description: `exportImageToAsset(assetId: ${assetId}, description: ${description})`,
                assetId,
                retries
            })
        })
    )
}

const assetDestination$ = (description, assetId) => {
    if (!assetId && !description)
        throw new Error('description or assetId must be specified')
    description = description || Path.dirname(assetId)
    return assetId
        ? of({description, assetId})
        : ee.listBuckets$('projects/earthengine-legacy').pipe(
            map(({assets}) => {
                if (!assets || !assets.length)
                    throw new Error('EE account has no asset roots')
                return ({description, assetId: Path.join(assets[0].id, description)})
            })
        )
}

const createParentFolder$ = assetId => {
    return ee.createParentFolder$(assetId, 1).pipe(
        progress({
            defaultMessage: `Create asset folder '${assetId}'`,
            messageKey: 'tasks.ee.export.asset.createFolder',
            messageArgs: {assetId}
        }),
        catchError(() => EMPTY)
    )
}

const deleteAsset$ = assetId =>
    ee.deleteAsset$(assetId, 1).pipe(
        progress({
            defaultMessage: `Deleted asset '${assetId}'`,
            messageKey: 'tasks.ee.export.asset.delete',
            messageArgs: {assetId}
        }),
        catchError(() => EMPTY)
    )

const formatRegion$ = region =>
    ee.getInfo$(region.bounds(1), 'format region for export').pipe(
        map(geometry => ee.Geometry(geometry))
    )

const share$ = ({sharing, assetId}) =>
    defer(() => sharing === 'PUBLIC'
        ? concat(
            of(true).pipe(
                progress({
                    defaultMessage: `Sharing asset '${assetId}'`,
                    messageKey: 'tasks.ee.export.asset.createFolder',
                    messageArgs: {assetId}
                })
            ),
            http.postJson$(`https://earthengine.googleapis.com/v1/${assetId}:setIamPolicy`, {
                headers: {'x-goog-user-project': ee.data.getProject(), Authorization: ee.data.getAuthToken()},
                body: {policy: {bindings: [{role: 'roles/viewer', members: ['allUsers']}]}}
            }).pipe(
                swallow()
            )
        )
        : EMPTY)
export {exportImageToAsset$}
