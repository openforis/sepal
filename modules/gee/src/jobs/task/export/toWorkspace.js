import {defer, map, switchMap} from 'rxjs'

import ee from '#sepal/ee/ee'
import {currentEEContext} from '#sepal/ee/eeContext'

import {exportFolderName, prepareDestination$} from '../storage/destination.js'
import {castToLargest} from './castToLargest.js'

// Into the user's Drive, or their bucket when they have no Google account; the container downloads from there.
export const startImageToWorkspaceExport$ = ({
    image, folder: requestedFolder, description, region, dimensions, scale, crs, crsTransform, maxPixels = 1e13, shardSize,
    fileDimensions, skipEmptyTiles, fileFormat, formatOptions
}, {sepalUser}) => defer(() => {
    const auth = currentEEContext().auth
    // The destination and the Earth Engine export must name the same folder.
    const folder = exportFolderName(requestedFolder)
    const castImage = castToLargest(image)
    return prepareDestination$({folder}, {sepalUser, auth}).pipe(
        switchMap(({destination, exportTarget}) => formatRegion$(region || castImage.geometry()).pipe(
            switchMap(region => {
                const common = {
                    image: castImage, description, dimensions, region, scale, crs, crsTransform: crsTransform || undefined,
                    maxPixels, shardSize, fileDimensions, skipEmptyTiles, fileFormat, formatOptions
                }
                const serverConfig = exportTarget.type === 'drive'
                    ? ee.batch.Export.convertToServerParams({...common, folder, fileNamePrefix: description}, ee.data.ExportDestination.DRIVE, ee.data.ExportType.IMAGE)
                    : ee.batch.Export.convertToServerParams({...common, bucket: exportTarget.bucket, fileNamePrefix: `${exportTarget.fileNamePrefix}${description}`}, ee.data.ExportDestination.GCS, ee.data.ExportType.IMAGE)
                return ee.startImageExport$(ee.batch.ExportTask.create(serverConfig), `export to SEPAL (${description})`)
            }),
            map(eeTaskId => ({eeTaskId, destination}))
        ))
    )
})

const formatRegion$ = region =>
    ee.getInfo$(region.bounds(1), 'format region for export').pipe(
        map(geometry => ee.Geometry(geometry))
    )
