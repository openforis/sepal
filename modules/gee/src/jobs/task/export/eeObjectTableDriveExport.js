import {concat, defer, last, map} from 'rxjs'

import ee from '#sepal/ee/ee'
import {currentEEContext} from '#sepal/ee/eeContext'

import {exportFolderName, prepareDestination$} from '../storage/destination.js'
import {eeTableFileFormat} from './toWorkspace.js'

export const startTableToDriveExport$ = ({
    collection, description, folder: requestedFolder, filenamePrefix, fileFormat, selectors, maxVertices
}, {sepalUser}) => defer(() => {
    if (currentEEContext().auth.type === 'serviceAccount') {
        throw new Error('Cannot export to Drive using service account.')
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
