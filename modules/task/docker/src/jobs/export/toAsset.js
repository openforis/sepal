const ee = require('ee')
const {EMPTY, concat, of} = require('rx')
const {catchError, map, switchMap} = require('rx/operators')
const {swallow} = require('sepal/rxjs/operators')
const Path = require('path')
const {limiter$: exportLimiter$} = require('root/jobs/service/exportLimiter')
const task$ = require('root/ee/task')
const {progress} = require('root/rxjs/operators')

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
    retries = 0
}) => {
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
            exportToAsset$({
                task: ee.batch.Export.image.toAsset(image, description, assetId, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels),
                description: `exportImageToAsset(assetId: ${assetId}, description: ${description})`,
                assetId,
                retries
            })
        )
    )
}

module.exports = {exportImageToAsset$}
