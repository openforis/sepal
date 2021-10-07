const ee = require('sepal/ee')
const {concat, defer, switchMap} = require('rxjs')
const {finalize, swallow} = require('sepal/rxjs/operators')
const drive = require('root/drive')
const {initUserBucket$} = require('root/cloudStorageBucket')
const cloudStorage = require('root/cloudStorageDownload')
const log = require('sepal/log').getLogger('ee')
const {getCurrentContext$} = require('root/jobs/service/context')
const {exportLimiter$} = require('root/jobs/service/exportLimiter')
const {driveSerializer$} = require('root/jobs/service/driveSerializer')
const {gcsSerializer$} = require('root/jobs/service/gcsSerializer')
const task$ = require('root/ee/task')

const CONCURRENT_FILE_DOWNLOAD = 3

const drivePath = folder =>
    `SEPAL/exports/${folder}`

const createDriveFolder$ = folder =>
    defer(() => driveSerializer$(
        drive.getFolderByPath$({path: drivePath(folder), create: true})
    )).pipe(
        swallow()
    )

const exportImageToSepal$ = (
    {
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
        const exportToCloudStorage$ = ({task, description, _retries}) => {
            log.debug(() => ['Earth Engine <to Cloud Storage>:', description])
            return exportLimiter$(
                task$(task, description)
            )
        }
        const cloudStoragePrefix = `${folder}/`
        return defer(() =>
            gcsSerializer$(
                initUserBucket$()
            )
        ).pipe(
            switchMap(bucketPath => {
                const serverConfig = ee.batch.Export.convertToServerParams({
                    image,
                    description,
                    bucket: bucketPath,
                    fileNamePrefix: `${folder}/${prefix}`,
                    dimensions,
                    region,
                    scale,
                    crs,
                    crsTransform,
                    maxPixels,
                    shardSize,
                    fileDimensions,
                    skipEmptyTiles,
                    fileFormat,
                    formatOptions
                },
                ee.data.ExportDestination.GCS,
                ee.data.ExportType.IMAGE
                )
                const task = ee.batch.ExportTask.create(serverConfig)
                return concat(
                    exportToCloudStorage$({
                        task,
                        description: `export to Sepal through CS (${description})`,
                        retries
                    }),
                    cloudStorage.download$({
                        bucketPath,
                        prefix: cloudStoragePrefix,
                        downloadDir,
                        deleteAfterDownload: false
                    })
                ).pipe(
                    finalize(() => cloudStorage.delete$({bucketPath, prefix: cloudStoragePrefix}),
                        `Delete Cloud Storage files: ${bucketPath}:${cloudStoragePrefix}`)
                )
            }
            )
        )
    }

    const throughDrive$ = () => {
        const exportToDrive$ = ({task, description, folder, _retries}) => {
            log.debug(() => ['Earth Engine <to Google Drive>:', description])
            return exportLimiter$(
                concat(
                    createDriveFolder$(folder),
                    task$(task, description)
                )
            )
        }

        const downloadFromDrive$ = ({path, downloadDir}) =>
            drive.downloadSingleFolderByPath$(path, downloadDir, {
                concurrency: CONCURRENT_FILE_DOWNLOAD,
                deleteAfterDownload: true
            })

        const serverConfig = ee.batch.Export.convertToServerParams({
            image, description, folder, fileNamePrefix: prefix, dimensions, region, scale, crs,
            crsTransform, maxPixels, shardSize, fileDimensions, skipEmptyTiles, fileFormat, formatOptions
        },
        ee.data.ExportDestination.DRIVE,
        ee.data.ExportType.IMAGE
        )
        const task = ee.batch.ExportTask.create(serverConfig)
        return concat(
            exportToDrive$({
                task,
                description: `export to Sepal through Drive (${description})`,
                folder,
                retries
            }),
            downloadFromDrive$({
                path: drivePath(folder),
                downloadDir
            })
        ).pipe(
            finalize(() => drive.removeFolderByPath$({path: drivePath(folder)}), `Delete drive folder: ${folder}`)
        )
    }

    return getCurrentContext$().pipe(
        switchMap(({isUserAccount}) =>
            isUserAccount
                ? throughDrive$()
                : throughCloudStorage$()
        )
    )
}

module.exports = {exportImageToSepal$}
