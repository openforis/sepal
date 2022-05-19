const ee = require('sepal/ee')
const {EMPTY, concat, of, catchError, map, switchMap} = require('rxjs')
const {swallow} = require('sepal/rxjs')
const Path = require('path')
const {exportLimiter$} = require('task/jobs/service/exportLimiter')
const task$ = require('task/ee/task')
const {progress} = require('task/rxjs/operators')

const deleteAsset$ = assetId =>
    ee.deleteAsset$(assetId, 3).pipe(
        progress({
            defaultMessage: `Deleted asset '${assetId}'`,
            messageKey: 'tasks.ee.export.asset.delete',
            messageArgs: {assetId}
        }),
        catchError(() => EMPTY)
    )

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

const formatRegion$ = region =>
    ee.getInfo$(region, 'format region for export').pipe(
        map(geometry => ee.Geometry(geometry))
    )

const exportImageToAsset$ = ({
    image,
    description,
    assetId,
    pyramidingPolicy,
    dimensions,
    region,
    scale,
    crs,
    crsTransform,
    maxPixels = 1e13,
    shardSize = 256,
    retries = 0
}) => {
    region = region || image.geometry().bounds()
    const exportToAsset$ = ({task, description, assetId, _retries}) => {
        if (ee.sepal.getAuthType() === 'SERVICE_ACCOUNT')
            throw new Error('Cannot export to asset using service account.')
        return exportLimiter$(
            concat(
                deleteAsset$(assetId).pipe(swallow()),
                task$(task, description)
            )
        )
    }

    return assetDestination$(description, assetId).pipe(
        switchMap(({description, assetId}) => 
            formatRegion$(region).pipe(
                switchMap(region => {
                    const serverConfig = ee.batch.Export.convertToServerParams(
                        {image, description, assetId, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels, shardSize},
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
        )
    )
}

module.exports = {exportImageToAsset$}
