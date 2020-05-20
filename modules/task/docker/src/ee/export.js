const ee = require('ee')
const {concat, of} = require('rxjs')
const {map, switchMap} = require('rxjs/operators')
const {executeTask$} = require('./task')
const {assetRoots$, deleteAsset$} = require('./asset')
const Path = require('path')
const moment = require('moment')
// const {initUserBucket$} = require('root/cloudStorage')
const drive = require('root/drive')
// const {download$: downloadFromDrive$} = require('root/downloadDrive')
const log = require('sepal/log').getLogger('ee')

const CONCURRENT_FILE_DOWNLOAD = 3

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
    const assetDestination$ = (description, assetId) => {
        if (!assetId && !description)
            throw new Error('description or assetId must be specified')
        description = description || Path.dirname(assetId)
        return assetId
            ? of({description, assetId})
            : assetRoots$().pipe(
                map(assetRoots => {
                    if (!assetRoots || !assetRoots.length)
                        throw new Error('EE account has no asset roots')
                    return ({description, assetId: Path.join(assetRoots[0], description)})
                })
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

    return assetDestination$(description, assetId).pipe(
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
}

const exportImageToSepal$ = ({
    image,
    description,
    downloadDir,
    dimensions,
    region,
    scale,
    crs,
    crsTransform,
    maxPixels = 1e13,
    shardSize,
    fileDimensions,
    skipEmptyTiles,
    fileFormat,
    formatOptions,
    retries
}) => {
    const folder = `${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`
    const prefix = description
    const drivePath = `SEPAL/exports/${folder}`

    const ensureDrivePathExists$ = path =>
        drive.getFolderByPath$({path, create: true})

    const exportToDrive$ = ({createTask, description, retries}) => {
        log.debug('Earth Engine <to Google Drive>:', description)
        return export$({
            create$: () => {
                const task = createTask()
                return executeTask$(task)
            },
            description,
            retries
        })
    }

    const downloadFromDrive$ = ({path, downloadDir, deleteAfterDownload}) =>
        drive.downloadSingleFolderByPath$(path, downloadDir, {
            concurrency: CONCURRENT_FILE_DOWNLOAD,
            deleteAfterDownload
        }).pipe(
            map(stats => ({name: 'DOWNLOADING', data: stats}))
        )

    return ensureDrivePathExists$(drivePath).pipe(
        switchMap(() =>
            concat(
                exportToDrive$({
                    createTask: () =>
                        // NOTE: folder is the last path element only for two reasons:
                        //    1) Drive treats "/" as a normal character
                        //    2) Drive can resolve a path by the last portion if it exists
                        ee.batch.Export.image.toDrive(
                            image, description, folder, prefix, dimensions, region, scale, crs,
                            crsTransform, maxPixels, shardSize, fileDimensions, skipEmptyTiles, fileFormat, formatOptions
                        ),
                    description: `exportImageToSepal(description: ${description})`,
                    retries
                }),
                downloadFromDrive$({
                    path: drivePath,
                    downloadDir,
                    deleteAfterDownload: false
                })
            )
        )
    )
}

// const exportImageToSepal$ = ({
//     image,
//     description,
//     downloadDir,
//     dimensions,
//     region,
//     scale,
//     crs,
//     crsTransform,
//     maxPixels = 1e13,
//     fileDimensions,
//     skipEmptyTiles,
//     fileFormat,
//     formatOptions,
//     retries
// }) => {
//     const fileNamePrefix = `ee_export/${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}/`
//     const exportToCloudStorage$ = ({createTask, description, retries}) => {
//         log.debug('Earth Engine <to cloud storage>:', description)
//         return export$({
//             create$: () => {
//                 const task = createTask()
//                 return concat(
//                     executeTask$(task)
//                 )
//             },
//             description,
//             retries
//         })
//     }

//     return initUserBucket$().pipe(
//         switchMap(bucket => {
//             const export$ = exportToCloudStorage$({
//                 createTask: () => ee.batch.Export.image.toCloudStorage(
//                     image, description, bucket, fileNamePrefix, dimensions, region, scale, crs,
//                     crsTransform, maxPixels, fileDimensions, skipEmptyTiles, fileFormat, formatOptions
//                 ),
//                 description: `exportImageToSepal(description: ${description})`,
//                 retries
//             })
//             const download$ = downloadFromCloudStorage$({
//                 bucket,
//                 prefix: fileNamePrefix,
//                 downloadDir,
//                 deleteAfterDownload: false
//             })
//             return concat(export$, download$)
//         })
//     )
// }

const export$ = ({create$, description, retries}) =>
    create$() // TODO: Retries?

module.exports = {exportImageToAsset$, exportImageToSepal$}
