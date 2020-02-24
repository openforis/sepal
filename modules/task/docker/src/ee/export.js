const ee = require('ee')
const {concat, of} = require('rxjs')
const {map, switchMap} = require('rxjs/operators')
const {executeTask$} = require('./task')
const {assetRoots$, deleteAsset$} = require('./asset')
const path = require('path')
const moment = require('moment')
const {initUserBucket$} = require('root/cloudStorage')
const {downloadFromCloudStorage$} = require('root/cloudStorage/download')
const log = require('sepal/log').getLogger('ee')

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
        maxPixels = 1e13,
        retries = 0
    }) =>
    assetDestination$(description, assetId).pipe(
        switchMap(({description, assetId}) =>
            exportToAsset$({
                createTask: () => ee.batch.Export.image.toAsset(
                    image, description, assetId, pyramidingPolicy, dimensions, region, scale, crs, crsTransform, maxPixels
                ),
                description: `exportImageToAsset(assetId: ${assetId}, description: ${description})`,
                assetId,
                retries
            })
        )
    )

const exportImageToSepal$ = (
    {
        image,
        description,
        downloadDir,
        dimensions,
        region,
        scale,
        crs,
        crsTransform,
        maxPixels = 1e13,
        fileDimensions,
        skipEmptyTiles,
        fileFormat,
        formatOptions,
        retries
    }) => {
    const fileNamePrefix = `ee_export/${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}/`
    return initUserBucket$().pipe(
        switchMap(bucket => {
                const export$ = exportToCloudStorage$({
                    createTask: () => {
                        log.fatal({description, bucket, fileNamePrefix})
                        return ee.batch.Export.image.toCloudStorage(
                            image, description, bucket, fileNamePrefix, dimensions, region, scale, crs,
                            crsTransform, maxPixels, fileDimensions, skipEmptyTiles, fileFormat, formatOptions
                        )
                    },
                    description: `exportImageToSepal(description: ${description})`,
                    retries
                })
                const download$ = downloadFromCloudStorage$({
                    bucket,
                    prefix: fileNamePrefix,
                    downloadDir,
                    deleteAfterDownload: false
                })
                return concat(export$, download$)
            }
        )
    )
}

const assetDestination$ = (description, assetId) => {
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
                deleteAsset$(assetId),
                executeTask$(task)
            )
        },
        description,
        retries
    })
}


const exportToCloudStorage$ = ({createTask, description, retries}) => {
    log.warn('Exporting task', description)
    return export$({
        create$: () => {
            const task = createTask()
            return concat(
                executeTask$(task)
            )
        },
        description,
        retries
    })
}

const export$ = ({create$, description, retries}) =>
    create$() // TODO: Retries...


module.exports = {exportImageToAsset$, exportImageToSepal$}
