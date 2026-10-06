import {concat, defer, last, map, of, switchMap} from 'rxjs'

import {drive} from '#gee/jobs/ee/batch/drive'
import ee from '#sepal/ee/ee'
import {currentEEContext} from '#sepal/ee/eeContext'

import {castToLargest} from './castToLargest.js'

const drivePath = folder => `SEPAL/exports/${folder}`

// Earth Engine writes into a folder of that name anywhere in the user's Drive; SEPAL creates it in its own tree
// first so the export lands there.
export const startImageToDriveExport$ = ({
    image, folder, description, dimensions, region, scale, crs, crsTransform, maxPixels = 1e13, shardSize,
    fileDimensions, skipEmptyTiles, fileFormat, formatOptions
}, {sepalUser}) => defer(() => {
    if (currentEEContext().auth.type === 'serviceAccount') {
        return of({eeTaskId: null})
    }
    const castImage = castToLargest(image)
    return formatRegion$(region || castImage.geometry()).pipe(
        switchMap(region => {
            const serverConfig = ee.batch.Export.convertToServerParams(
                {
                    image: castImage, description, folder, fileNamePrefix: description, dimensions, region, scale, crs,
                    crsTransform: crsTransform || undefined, maxPixels, shardSize, fileDimensions, skipEmptyTiles,
                    fileFormat, formatOptions
                },
                ee.data.ExportDestination.DRIVE,
                ee.data.ExportType.IMAGE
            )
            return concat(
                drive({sepalUser}).createFolder$({path: drivePath(folder)}),
                ee.startImageExport$(ee.batch.ExportTask.create(serverConfig), `export to Drive (${description})`)
            ).pipe(last())
        }),
        map(eeTaskId => ({eeTaskId}))
    )
})

const formatRegion$ = region =>
    ee.getInfo$(region.bounds(1), 'format region for export').pipe(
        map(geometry => ee.Geometry(geometry))
    )
