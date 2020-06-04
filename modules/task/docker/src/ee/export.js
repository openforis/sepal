const ee = require('ee')
const {concat, defer, of} = require('rxjs')
const {first, map, switchMap} = require('rxjs/operators')
const {swallow} = require('sepal/rxjs/operators')

const Path = require('path')
const {limiter$} = require('./eeExportLimiter')
const {Limiter} = require('sepal/service/limiter')
const drive = require('root/drive')
const {initUserBucket$} = require('root/cloudStorage')
const {downloadFromCloudStorage$} = require('root/cloudStorageDownload')
const log = require('sepal/log').getLogger('ee')
const {credentials$} = require('root/credentials')

const runTask$ = require('root/jobs/ee/task/runTask')
const assetRoots$ = require('root/jobs/ee/asset/getAssetRoots')
const deleteAsset$ = require('root/jobs/ee/asset/deleteAsset')

const CONCURRENT_FILE_DOWNLOAD = 3

const drivePath = folder =>
    `SEPAL/exports/${folder}`

const createDriveFolder$ = folder =>
    defer(() => serialize$(
        drive.getFolderByPath$({path: drivePath(folder), create: true})
    )).pipe(
        swallow()
    )

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

const exportImageToSepal$ = ({
    imageDef,
    folder,
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
    const prefix = description

    const throughCloudStorage$ = () => {
        const exportToCloudStorage$ = ({taskDef, description, retries}) => {
            log.debug('Earth Engine <to Cloud Storage>:', description)
            return limiter$(
                runTask$({credentials$, taskDef, description})
            )
        }

        return initUserBucket$().pipe(
            switchMap(bucketPath => {
                return concat(
                    exportToCloudStorage$({
                        taskDef: {
                            imageDef,
                            method: 'toCloudStorage',
                            args: [
                                // image,
                                description, bucketPath, `${folder}/${prefix}`, dimensions, region, scale, crs,
                                crsTransform, maxPixels, fileDimensions, skipEmptyTiles, fileFormat, formatOptions
                            ]
                        },
                        description: `export to Sepal through CS (${description})`,
                        retries
                    }),
                    downloadFromCloudStorage$({
                        bucketPath,
                        prefix: `${folder}/`,
                        downloadDir,
                        deleteAfterDownload: true
                    })
                )
            })
        )
    }

    const throughDrive$ = () => {
        const exportToDrive$ = ({taskDef, description, folder, retries}) => {
            log.debug('Earth Engine <to Google Drive>:', description)
            return limiter$(
                concat(
                    createDriveFolder$(folder),
                    runTask$({credentials$, taskDef, description})
                )
            )
        }

        const downloadFromDrive$ = ({path, downloadDir}) =>
            drive.downloadSingleFolderByPath$(path, downloadDir, {
                concurrency: CONCURRENT_FILE_DOWNLOAD,
                deleteAfterDownload: true
            })

        return concat(
            exportToDrive$({
                taskDef: {
                    imageDef,
                    method: 'toDrive',
                    args: [
                        // image,
                        description, folder, prefix, dimensions, region, scale, crs,
                        crsTransform, maxPixels, shardSize, fileDimensions, skipEmptyTiles, fileFormat, formatOptions
                    ]
                },
                description: `export to Sepal through Drive (${description})`,
                folder,
                retries
            }),
            downloadFromDrive$({
                path: drivePath(folder),
                downloadDir
            })
        )
    }

    return credentials$.pipe(
        first(),
        switchMap(({userCredentials}) => userCredentials
            ? throughDrive$()
            : throughCloudStorage$()
        )
    )
}

const {limiter$: serialize$} = Limiter({
    name: 'Serializer',
    maxConcurrency: 1
})

module.exports = {exportImageToAsset$, exportImageToSepal$}
