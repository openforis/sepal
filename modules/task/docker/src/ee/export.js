const ee = require('ee')
const {concat, defer, of} = require('rxjs')
const {first, map, switchMap} = require('rxjs/operators')
const {swallow} = require('sepal/rxjs/operators')
const {executeTask$} = require('./task')
const {assetRoots$, deleteAsset$} = require('./asset')
const Path = require('path')
const {limiter$} = require('./eeExportLimiter')
const {Limiter} = require('sepal/service/limiter')
const drive = require('root/drive')
const {initUserBucket$} = require('root/cloudStorage')
const {downloadFromCloudStorage$} = require('root/cloudStorageDownload')
const log = require('sepal/log').getLogger('ee')
const {credentials$} = require('root/credentials')

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
                    executeTask$(task, description)
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
    folder,
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
    const prefix = description

    const throughCloudStorage$ = () => {
        const exportToCloudStorage$ = ({createTask, description, retries}) => {
            log.debug('Earth Engine <to cloud storage>:', description)
            return export$({
                create$: () => executeTask$(createTask(), description),
                description,
                retries
            })
        }

        return initUserBucket$().pipe(
            switchMap(bucketPath => {
                return concat(
                    exportToCloudStorage$({
                        createTask: () => ee.batch.Export.image.toCloudStorage(
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
        const exportToDrive$ = ({createTask, description, folder, retries}) => {
            log.debug('Earth Engine <to Google Drive>:', description)
            return export$({
                create$: () => concat(
                    createDriveFolder$(folder),
                    executeTask$(createTask(), description)
                ),
                description,
                retries
            })
        }

        const downloadFromDrive$ = ({path, downloadDir}) =>
            drive.downloadSingleFolderByPath$(path, downloadDir, {
                concurrency: CONCURRENT_FILE_DOWNLOAD,
                deleteAfterDownload: true
            })

        return concat(
            exportToDrive$({
                createTask: () =>
                // NOTE: folder is the last path element only for two reasons:
                //    1) Drive treats "/" as a normal character
                //    2) Drive can resolve a path by the last portion if it exists
                    ee.batch.Export.image.toDrive(
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

const {limiter$: serialize$} = Limiter({
    name: 'Serializer',
    maxConcurrency: 1
})

const export$ = ({create$, _description, _retries}) =>
    limiter$(
        create$()
    )

module.exports = {exportImageToAsset$, exportImageToSepal$}
