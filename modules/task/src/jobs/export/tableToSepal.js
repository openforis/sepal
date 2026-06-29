import moment from 'moment'
import {concat, defer, switchMap} from 'rxjs'

import ee from '#sepal/ee/ee'
import {getLogger} from '#sepal/log'
import {finalizeObservable, swallow} from '#sepal/rxjs'
import {initUserBucket$} from '#task/cloudStorageBucket'
import * as cloudStorage from '#task/cloudStorageDownload'
import * as drive from '#task/drive'
import {task$} from '#task/ee/task'
import {getCurrentContext$} from '#task/jobs/service/context'
import {driveSerializer$} from '#task/jobs/service/driveSerializer'
import {exportLimiter$} from '#task/jobs/service/exportLimiter'
import {gcsSerializer$} from '#task/jobs/service/gcsSerializer'
import {mkdir$} from '#task/rxjs/fileSystem'

import {drivePath} from './driveUtils.js'

const log = getLogger('ee')

const CONCURRENT_FILE_DOWNLOAD = 3

// Earth Engine table-export fileFormat values. The GUI already uses EE's exact spellings, so this is an
// identity map with a safe CSV fallback for anything unexpected. Pure (no EE) - kept exported for tests.
const SUPPORTED_FILE_FORMATS = ['CSV', 'GeoJSON', 'KML', 'KMZ', 'SHP']
export const eeTableFileFormat = fileFormat =>
    SUPPORTED_FILE_FORMATS.includes(fileFormat) ? fileFormat : 'CSV'

// Exports an EE FeatureCollection to the user's SEPAL workspace, mirroring exportImageToSepal$:
// user account -> export to Drive then download; service account -> export to Cloud Storage then
// download. Geometry is preserved (no .geo stripping). NOTE: EE table exports do not support an output
// CRS / crsTransform, so those options are accepted for signature parity but intentionally ignored;
// reprojection of vector output is out of scope for this slice.
export const tableToSepal$ = (taskId, {
    collection,
    description,
    workspacePath,
    filenamePrefix,
    fileFormat,
    selectors
}) => {
    const prefix = filenamePrefix || description
    const format = eeTableFileFormat(fileFormat)
    const folder = `${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`
    // Geometry-capable formats (GeoJSON/KML/KMZ/SHP) always carry the feature geometry, so property
    // `selectors` don't drop it. CSV is columnar: when selectors are given, the geometry is only included
    // if `.geo` is among them - so add it for CSV to keep usable sample locations.
    const exportSelectors = selectors && format === 'CSV' && !selectors.includes('.geo')
        ? [...selectors, '.geo']
        : selectors

    const createDriveFolder$ = () =>
        defer(() => driveSerializer$(
            drive.getFolderByPath$({path: drivePath(folder), create: true})
        )).pipe(swallow())

    const throughDrive$ = downloadDir => {
        log.debug(() => ['Earth Engine <table to Google Drive>:', description])
        const serverConfig = ee.batch.Export.convertToServerParams(
            {collection, description, folder, fileNamePrefix: prefix, fileFormat: format, selectors: exportSelectors},
            ee.data.ExportDestination.DRIVE,
            ee.data.ExportType.TABLE
        )
        const task = ee.batch.ExportTask.create(serverConfig)
        return concat(
            exportLimiter$(
                concat(
                    createDriveFolder$(),
                    task$(taskId, task, `export table to Sepal through Drive (${description})`)
                )
            ),
            drive.downloadSingleFolderByPath$(drivePath(folder), downloadDir, {
                concurrency: CONCURRENT_FILE_DOWNLOAD,
                deleteAfterDownload: true
            })
        ).pipe(
            finalizeObservable(
                () => drive.removeFolderByPath$({path: drivePath(folder)}),
                taskId,
                `Delete drive folder: ${folder}`
            )
        )
    }

    const throughCloudStorage$ = downloadDir => {
        log.debug(() => ['Earth Engine <table to Cloud Storage>:', description])
        const cloudStoragePrefix = `${folder}/`
        return defer(() =>
            gcsSerializer$(
                initUserBucket$()
            )
        ).pipe(
            switchMap(bucketPath => {
                const serverConfig = ee.batch.Export.convertToServerParams(
                    {collection, description, bucket: bucketPath, fileNamePrefix: `${folder}/${prefix}`, fileFormat: format, selectors: exportSelectors},
                    ee.data.ExportDestination.GCS,
                    ee.data.ExportType.TABLE
                )
                const task = ee.batch.ExportTask.create(serverConfig)
                return concat(
                    exportLimiter$(
                        task$(taskId, task, `export table to Sepal through CS (${description})`)
                    ),
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
            })
        )
    }

    return getCurrentContext$().pipe(
        switchMap(({config, isUserAccount}) => {
            const downloadDir = workspacePath
                ? `${config.homeDir}/${workspacePath}/`
                : `${config.homeDir}/downloads/${description}/`
            return mkdir$(downloadDir, {recursive: true}).pipe(
                switchMap(dir =>
                    isUserAccount
                        ? throughDrive$(dir)
                        : throughCloudStorage$(dir)
                )
            )
        })
    )
}
