import {concat, defer, EMPTY, map, switchMap} from 'rxjs'

import ee from '#sepal/ee/ee'
import {getLogger} from '#sepal/log'
import {swallow} from '#sepal/rxjs'
import * as drive from '#task/drive'
const log = getLogger('ee')
import {task$} from '#task/ee/task'
import {getCurrentContext$} from '#task/jobs/service/context'
import {driveSerializer$} from '#task/jobs/service/driveSerializer'
import {exportLimiter$} from '#task/jobs/service/exportLimiter'

import {drivePath} from './driveUtils.js'

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

const exportImageToDrive$ = (taskId, {
    image,
    folder,
    description,
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
        return exportToDrive$(taskId, {
            task,
            description: `export to Drive (${description})`,
            folder,
            retries
        })
    }

    return formatRegion$(region).pipe(
        switchMap(region => getCurrentContext$().pipe(
            switchMap(({isUserAccount}) =>
                isUserAccount
                    ? throughDrive$(region)
                    : EMPTY
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

export {exportImageToDrive$}
