const ee = require('ee')
const {concat} = require('rxjs')
const {executeTask$} = require('./task')
const {deleteAsset$} = require('./asset')

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
    }) => {
    return exportToAsset$({
        createTask: () => ee.batch.Export.image.toAsset(
            image, description, assetId, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels
        ),
        description: `exportImageToAsset(assetId: ${assetId}, description: ${description})`,
        retries
    })
}

const exportToAsset$ = ({createTask, description, retries}) => {
    if (ee.sepal.getAuthType() === 'SERVICE_ACCOUNT')
        throw new Error('Cannot export to asset using service account.')
    return export$({
        create$: () => {
            const task = createTask()
            return concat(
                deleteAsset$(task.config_.assetId), // TODO: Get assetId a different way
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
