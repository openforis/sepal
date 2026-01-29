const ee = require('#sepal/ee/ee')
const {concat, defer, map, switchMap} = require('rxjs')
const {finalizeObservable, swallow} = require('#sepal/rxjs')
const drive = require('#task/drive')
const {initUserBucket$} = require('#task/cloudStorageBucket')
const cloudStorage = require('#task/cloudStorageDownload')
const log = require('#sepal/log').getLogger('ee')
const {getCurrentContext$} = require('#task/jobs/service/context')
const {exportLimiter$} = require('#task/jobs/service/exportLimiter')
const {driveSerializer$} = require('#task/jobs/service/driveSerializer')
const {gcsSerializer$} = require('#task/jobs/service/gcsSerializer')
const {task$} = require('#task/ee/task')
const {drivePath} = require('./driveUtils')

const CONCURRENT_FILE_DOWNLOAD = 3

const createDriveFolder$ = folder =>
    defer(() => driveSerializer$(
        drive.getFolderByPath$({path: drivePath(folder), create: true})
    )).pipe(
        swallow()
    )

const exportToDrive$ = (taskId, {task, description, folder, _retries}) => {
    log.debug(() => ['Earth Engine <to Google Drive>:', description])
    return exportLimiter$(
        concat(
            createDriveFolder$(folder),
            task$(taskId, task, description)
        )
    )
}

const downloadFromDrive$ = ({path, downloadDir}) =>
    drive.downloadSingleFolderByPath$(path, downloadDir, {
        concurrency: CONCURRENT_FILE_DOWNLOAD,
        deleteAfterDownload: true
    })

const exportToCloudStorage$ = (taskId, {task, description, _retries}) => {
    log.debug(() => ['Earth Engine <to Cloud Storage>:', description])
    return exportLimiter$(
        task$(taskId, task, description)
    )
}

const exportImageToSepal$ = (taskId, {
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
    crsTransform = crsTransform || undefined
    region = region || image.geometry()
    image = castToLargest(image)
    const prefix = description

    const throughCloudStorage$ = region => {
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
                    exportToCloudStorage$(taskId, {
                        task,
                        description: `export to Sepal through CS (${description})`,
                        retries
                    }),
                    cloudStorage.download$(taskId, {
                        bucketPath,
                        prefix: cloudStoragePrefix,
                        downloadDir,
                        deleteAfterDownload: false
                    })
                ).pipe(
                    finalizeObservable(
                        () => cloudStorage.delete$({bucketPath, prefix: cloudStoragePrefix}),
                        taskId,
                        `Delete Cloud Storage files: ${bucketPath}:${cloudStoragePrefix}`
                    )
                )
            }
            )
        )
    }

    const throughDrive$ = region => {
        const serverConfig = ee.batch.Export.convertToServerParams(
            {
                image, description, folder, fileNamePrefix: prefix, dimensions, region, scale, crs,
                crsTransform, maxPixels, shardSize, fileDimensions, skipEmptyTiles, fileFormat, formatOptions
            },
            ee.data.ExportDestination.DRIVE,
            ee.data.ExportType.IMAGE
        )
        const task = ee.batch.ExportTask.create(serverConfig)
        return concat(
            exportToDrive$(taskId, {
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
            finalizeObservable(
                () => drive.removeFolderByPath$({path: drivePath(folder)}),
                taskId,
                `Delete drive folder: ${folder}`
            )
        )
    }

    return formatRegion$(region).pipe(
        switchMap(region => getCurrentContext$().pipe(
            switchMap(({isUserAccount}) =>
                isUserAccount
                    ? throughDrive$(region)
                    : throughCloudStorage$(region)
            )
        ))
    )
}

const castToLargest = image => {
    const precisions = ee.List(['int', 'float', 'double'])
    const collection = ee.FeatureCollection(
        ee.List(
            ee.Dictionary(
                ee.Algorithms.Describe(image)
            ).get('bands')
        ).map(band => {
            const dataType = ee.Dictionary(
                ee.Dictionary(band).get('data_type')
            )
            const precision = dataType.getString('precision')
            const precisionIndex = precisions.indexOf(precision)
            const minValue = dataType
                .select(['min'], true)
                .values()
                .reduce(ee.Reducer.first())
            const maxValue = dataType
                .select(['max'], true)
                .values()
                .reduce(ee.Reducer.first())
            return ee.Feature(null, {
                precisionIndex,
                minValue,
                maxValue
            })
        })
    )
    const precision = precisions.getString(collection.aggregate_max('precisionIndex'))
    const minValue = ee.Algorithms.If(
        precision.equals('int'),
        collection.aggregate_min('minValue'),
        null
    )
    const maxValue = ee.Algorithms.If(
        precision.equals('int'),
        collection.aggregate_max('maxValue'),
        null
    )

    const pixelType = ee.PixelType({
        precision,
        minValue,
        maxValue
    })
    return image.cast(
        ee.Dictionary.fromLists(
            image.bandNames(),
            ee.List.repeat(pixelType, image.bandNames().size())
        )
    )
}

const formatRegion$ = region =>
    ee.getInfo$(region.bounds(1), 'format region for export').pipe(
        map(geometry => ee.Geometry(geometry))
    )

module.exports = {exportImageToSepal$}
