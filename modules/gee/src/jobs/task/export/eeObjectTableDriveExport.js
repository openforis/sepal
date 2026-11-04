import {concat, defer, last, map, of} from 'rxjs'

import ee from '#sepal/ee/ee'
import {isServiceAccount} from '#sepal/ee/eeContext'

import {exportFolderName, prepareDestination$} from '../storage/destination.js'
import {eeTableFileFormat} from './toWorkspace.js'

export const startTableToDriveExport$ = ({
    collection, description, folder: requestedFolder, filenamePrefix, fileFormat, selectors, maxVertices
}, {sepalUser}) => defer(() => {
    if (isServiceAccount()) {
        return of({eeTaskId: null})
    }
    const folder = exportFolderName(requestedFolder)
    const serverConfig = ee.batch.Export.convertToServerParams({
        collection, description, folder, fileNamePrefix: filenamePrefix || description,
        fileFormat: eeTableFileFormat(fileFormat), selectors, maxVertices
    }, ee.data.ExportDestination.DRIVE, ee.data.ExportType.TABLE)
    return concat(
        prepareDestination$({folder}, {sepalUser, auth: {type: 'user'}}),
        ee.startTableExport$(ee.batch.ExportTask.create(serverConfig), `export table to Drive (${description})`)
    ).pipe(last(), map(eeTaskId => ({eeTaskId})))
})
