const ee = require('#sepal/ee')
const {EMPTY, concat, defer, from, catchError, last, map, mergeMap, of, scan, switchMap, tap, throwError} = require('rxjs')
const {swallow} = require('#sepal/rxjs')
const tile = require('#sepal/ee/tile')
const Path = require('path')
const {exportLimiter$} = require('#task/jobs/service/exportLimiter')
const {task$} = require('#task/ee/task')
const {progress} = require('#task/rxjs/operators')
const log = require('#sepal/log').getLogger('task')
const http = require('#sepal/httpClient')
const _ = require('lodash')

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
    retries = 0,
}) => {
    crsTransform = crsTransform || undefined
    region = region || image.geometry()
    if (ee.sepal.getAuthType() === 'SERVICE_ACCOUNT')
        throw new Error('Cannot export to asset using service account.')
    const export$ = ({description, assetId}) => assetType === 'ImageCollection'
        ? imageToAssetCollection$(taskId, {
            image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize, tileSize, properties, retries
        })
        : imageToAsset$(taskId, {
            image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize, properties, retries
        })
    return assetDestination$(description, assetId).pipe(
        switchMap(({description, assetId}) =>
            concat(
                createParentFolder$(assetId),
                export$({description, assetId}),
                share$({sharing, assetId})
            )
        ))
}

const imageToAssetCollection$ = (taskId, {
    image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize, tileSize, properties, retries
}) => {
    const tileFeatures = tile(ee.FeatureCollection([ee.Feature(region)]), tileSize)

    const replaceAsset$ = asset => {
        const delete$ = () => asset.type === 'ImageCollection'
            ? ee.deleteAssetRecursive$(assetId, ['ImageCollection', 'Image'], 0)
            : asset.type === 'Image'
                ? deleteAsset$(assetId)
                : throwError(() => 'Asset ID already exists, but isn\'t an image or image collection')
        return concat(
            delete$(),
            ee.createImageCollection$(assetId, {}, 1)
        )
    }

    const prepareCollection$ = () => {
        return ee.getAsset$(assetId).pipe(
            catchError(() => of(null)),
            switchMap(asset => {
                if (asset && strategy === 'replace') {
                    return replaceAsset$(asset)
                } else if (asset) {
                    return of(true)
                } else {
                    return ee.createImageCollection$(assetId, {}, 1)
                }
            }),
            last(),
            switchMap(() => ee.getInfo$(image.toDictionary(), 'Extract image properties')),
            switchMap((imageProperties = {}) =>
                ee.replaceAssetProperties$(assetId, {...imageProperties, ...properties}, 1)
            ),
            swallow()
        )
    }
    
    const tilesToAssets$ = () => {
        const tileIds$ = ee.getInfo$(
            tileFeatures.aggregate_array('system:index'),
            'load tile ids'
        )
        const export$ = tileIds$.pipe(
            switchMap(tileIds => {
                const tileCount = tileIds.length
                const startingExport$ = of(true).pipe(progress({
                    defaultMessage: `Start export of ${tileCount} tiles`,
                    messageKey: 'tasks.ee.export.asset.startExport',
                    messageArgs: {tileCount}
                }))
                const export$ = exportTiles$(tileIds).pipe(
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
        const progress$ = of(true).pipe(progress({
            defaultMessage: 'Tiling image',
            messageKey: 'tasks.ee.export.asset.tilingImage'
        }))

        return concat(
            progress$,
            export$
        )
    }
    
    const exportTiles$ = tileIds => {
        const tile$ = from(
            tileIds.map((tileId, tileIndex) =>
                ({tileId, tileIndex})
            )
        )
        return tile$.pipe(
            mergeMap(({tileId, tileIndex}) => exportTile$({tileId, tileIndex}), 3)
        )
    }
    
    const exportTile$ = ({tileId, tileIndex}) => {
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
            strategy === 'resume'
                ? ee.getAsset$(tileAssetId, 0).pipe(
                    catchError(() => export$()), // Export non-existing
                )
                : export$(),
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
    return concat(
        prepareProgress$,
        prepareCollection$(),
        tilesToAssets$()
    )
}

const imageToAsset$ = (taskId, {
    image, description, assetId, strategy, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize, properties, retries
}) => {
    const exportToAsset$ = ({task, description, assetId, _retries}) => {
        return exportLimiter$(
            concat(
                strategy === 'replace'
                    ? ee.deleteAssetRecursive$(assetId, ['ImageCollection', 'Image'], 0).pipe(swallow())
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
        : ee.getAssetRoots$().pipe(
            map(assetRoots => {
                if (!assetRoots || !assetRoots.length)
                    throw new Error('EE account has no asset roots')
                return ({description, assetId: Path.join(assetRoots[0], description)})
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
                headers: {Authorization: ee.data.getAuthToken()},
                body: {policy: {bindings: [{role: 'roles/viewer', members: ['allUsers']}]}}
            }).pipe(
                swallow()
            )
        )
        : EMPTY)
module.exports = {exportImageToAsset$}
