const ee = require('ee')
const {concat, of} = require('rxjs')
const {map, switchMap} = require('rxjs/operators')
const {swallow} = require('sepal/rxjs/operators')

const Path = require('path')
const {limiter$} = require('./limiter')
const {credentials$} = require('root/credentials')

const runTask$ = require('root/jobs/ee/task/runTask')
const assetRoots$ = require('root/jobs/ee/asset/getAssetRoots')
const deleteAsset$ = require('root/jobs/ee/asset/deleteAsset')

const exportImageToAsset$ = ({
    imageDef,
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
    const assetDestination$ = (description, assetId) => {
        if (!assetId && !description)
            throw new Error('description or assetId must be specified')
        description = description || Path.dirname(assetId)
        return assetId
            ? of({description, assetId})
            : assetRoots$({credentials$}).pipe(
            // : assetRoots$().pipe(
                map(assetRoots => {
                    if (!assetRoots || !assetRoots.length)
                        throw new Error('EE account has no asset roots')
                    return ({description, assetId: Path.join(assetRoots[0], description)})
                })
            )
    }

    const exportToAsset$ = ({taskDef, description, assetId, retries}) => {
        if (ee.sepal.getAuthType() === 'SERVICE_ACCOUNT')
            throw new Error('Cannot export to asset using service account.')
        return limiter$(
            concat(
                deleteAsset$({credentials$, assetId}).pipe(swallow()),
                runTask$({credentials$, taskDef, description})
            )
        )
    }

    return assetDestination$(description, assetId).pipe(
        switchMap(({description, assetId}) =>
            exportToAsset$({
                taskDef: {
                    imageDef,
                    method: 'toAsset',
                    args: [
                        // image,
                        description, assetId, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels
                    ]
                },
                description: `exportImageToAsset(assetId: ${assetId}, description: ${description})`,
                assetId,
                retries
            })
        )
    )
}

module.exports = {exportImageToAsset$}
