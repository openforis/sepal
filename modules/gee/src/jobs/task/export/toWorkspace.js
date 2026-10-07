import moment from 'moment'
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
    // The region is resolved first: a failure there must not leave an empty folder behind.
    return formatRegion$(region || castImage.geometry()).pipe(
        switchMap(region => prepareDestination$({folder}, {sepalUser, auth}).pipe(
            switchMap(({destination, exportTarget}) => {
                const common = {
                    image: castImage, description, dimensions, region, scale, crs, crsTransform: crsTransform || undefined,
                    maxPixels, shardSize, fileDimensions, skipEmptyTiles, fileFormat, formatOptions
                }
                const serverConfig = exportTarget.type === 'drive'
                    ? ee.batch.Export.convertToServerParams({...common, folder, fileNamePrefix: description}, ee.data.ExportDestination.DRIVE, ee.data.ExportType.IMAGE)
                    : ee.batch.Export.convertToServerParams({...common, bucket: exportTarget.bucket, fileNamePrefix: `${exportTarget.fileNamePrefix}${description}`}, ee.data.ExportDestination.GCS, ee.data.ExportType.IMAGE)
                return ee.startImageExport$(ee.batch.ExportTask.create(serverConfig), `export to SEPAL (${description})`).pipe(
                    map(eeTaskId => ({eeTaskId, destination}))
                )
            })
        ))
    )
})

const formatRegion$ = region =>
    ee.getInfo$(region.bounds(1), 'format region for export').pipe(
        map(geometry => ee.Geometry(geometry))
    )

const SUPPORTED_TABLE_FORMATS = ['CSV', 'GeoJSON', 'KML', 'KMZ', 'SHP']

export const eeTableFileFormat = fileFormat =>
    SUPPORTED_TABLE_FORMATS.includes(fileFormat) ? fileFormat : 'CSV'

// Table exports have no region or CRS.
export const startTableToWorkspaceExport$ = ({collection, description, filenamePrefix, fileFormat, selectors}, {sepalUser}) => defer(() => {
    const auth = currentEEContext().auth
    const prefix = filenamePrefix || description
    const format = eeTableFileFormat(fileFormat)
    const folder = exportFolderName(`${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`)
    // CSV is columnar: the geometry survives a column selection only as `.geo`. The other formats always carry it.
    const exportSelectors = selectors && format === 'CSV' && !selectors.includes('.geo')
        ? [...selectors, '.geo']
        : selectors
    return prepareDestination$({folder}, {sepalUser, auth}).pipe(
        switchMap(({destination, exportTarget}) => {
            const common = {collection, description, fileFormat: format, selectors: exportSelectors}
            const serverConfig = exportTarget.type === 'drive'
                ? ee.batch.Export.convertToServerParams({...common, folder, fileNamePrefix: prefix}, ee.data.ExportDestination.DRIVE, ee.data.ExportType.TABLE)
                : ee.batch.Export.convertToServerParams({...common, bucket: exportTarget.bucket, fileNamePrefix: `${exportTarget.fileNamePrefix}${prefix}`}, ee.data.ExportDestination.GCS, ee.data.ExportType.TABLE)
            return ee.startTableExport$(ee.batch.ExportTask.create(serverConfig), `export table to SEPAL (${description})`).pipe(
                map(eeTaskId => ({eeTaskId, destination}))
            )
        })
    )
})
