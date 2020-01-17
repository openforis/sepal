const ee = require('ee')
const {concat, of} = require('rxjs')
const {map, switchMap} = require('rxjs/operators')
const {executeTask$} = require('./task')
const {assetRoots$, deleteAsset$} = require('./asset')
const path = require('path')

const exportImageToAsset$ = (
    {
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
        retries = 0
    }) =>
    destination$(description, assetId).pipe(
        switchMap(({description, assetId}) =>
            exportToAsset$({
                createTask: () => ee.batch.Export.image.toAsset(
                    image, description, assetId, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels
                ),
                description: `exportImageToAsset(assetId: ${assetId}, description: ${description})`,
                retries
            })
        )
    )

const destination$ = (description, assetId) => {
    if (!assetId && !description)
        throw new Error('description or assetId must be specified')
    description = description || path.dirname(assetId)
    return assetId
        ? of({description, assetId})
        : assetRoots$().pipe(
            map(assetRoots => {
                    if (!assetRoots || !assetRoots.length)
                        throw new Error('EE account has no asset roots')
                    return ({description, assetId: path.join(assetRoots[0], description)})
                }
            )
        )
}

const exportToAsset$ = ({createTask, description, assetId, retries}) => {
    if (ee.sepal.getAuthType() === 'SERVICE_ACCOUNT')
        throw new Error('Cannot export to asset using service account.')
    return export$({
        create$: () => {
            const task = createTask()
            return concat(
                deleteAsset$(assetId), // TODO: Get assetId a different way
                executeTask$(task)
            )
        },
        description,
        retries
    })
}

const export$ = ({create$, description, retries}) =>
    create$() // TODO: Retries...


module.exports = {exportImageToAsset$}
