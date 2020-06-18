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
const {getCredentials} = require('root/context')

const task$ = require('root/ee/task')

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
                task$(task, description)
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
                    task$(task, description)
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

    const {userCredentials} = getCredentials()
    return userCredentials
        ? throughDrive$()
        : throughCloudStorage$()
}

const {limiter$: serialize$} = Limiter({
    name: 'Serializer',
    maxConcurrency: 1
})

module.exports = {exportImageToSepal$}
