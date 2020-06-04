const ee = require('ee')
const {concat, defer} = require('rx')
const {first, switchMap} = require('rx/operators')
const {swallow} = require('sepal/rxjs/operators')

const {limiter$} = require('./limiter')
const {Limiter} = require('sepal/service/limiter')
const drive = require('root/drive')
const {initUserBucket$} = require('root/cloudStorage')
const {downloadFromCloudStorage$} = require('root/cloudStorageDownload')
const log = require('sepal/log').getLogger('ee')
const {credentials$} = require('root/credentials')

const runTask$ = require('root/jobs/ee/task/runTask')
const runTaskImmediate$ = require('root/ee/task')

const CONCURRENT_FILE_DOWNLOAD = 3

const drivePath = folder =>
    `SEPAL/exports/${folder}`

const createDriveFolder$ = folder =>
    defer(() => serialize$(
        drive.getFolderByPath$({path: drivePath(folder), create: true})
    )).pipe(
        swallow()
    )

const exportImageToSepal$ = ({
    image,
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
        const exportToCloudStorage$ = ({task, description, retries}) => {
            log.debug('Earth Engine <to Cloud Storage>:', description)
            return limiter$(
                runTaskImmediate$(task, description)
            )
        }

        return initUserBucket$().pipe(
            switchMap(bucketPath => {
                return concat(
                    exportToCloudStorage$({
                        task: ee.batch.Export.image.toCloudStorage(
                            image, description, bucketPath, `${folder}/${prefix}`, dimensions, region, scale, crs,
                            crsTransform, maxPixels, fileDimensions, skipEmptyTiles, fileFormat, formatOptions
                        ),
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
        const exportToDrive$ = ({task, description, folder, retries}) => {
            log.debug('Earth Engine <to Google Drive>:', description)
            return limiter$(
                concat(
                    createDriveFolder$(folder),
                    runTaskImmediate$(task, description)
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
                task: ee.batch.Export.image.toDrive(
                    image, description, folder, prefix, dimensions, region, scale, crs,
                    crsTransform, maxPixels, shardSize, fileDimensions, skipEmptyTiles, fileFormat, formatOptions
                ),
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

const exportImageDefToSepal$ = ({
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

module.exports = {exportImageToSepal$, exportImageDefToSepal$}
