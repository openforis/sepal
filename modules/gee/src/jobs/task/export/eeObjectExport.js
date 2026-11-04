import {randomUUID} from 'node:crypto'

import {defer} from 'rxjs'

import ee from '#sepal/ee/ee'
import {assertEEObjectExport, eeObjectDriveFolder, eeObjectFilenamePrefix, eeObjectTaskName} from '#sepal/eeObjectExport'

import {startTableToDriveExport$} from './eeObjectTableDriveExport.js'
import {startImageToAssetExport$, startTableToAssetExport$} from './toAsset.js'
import {startImageToDriveExport$} from './toDrive.js'
import {startImageToWorkspaceExport$, startTableToWorkspaceExport$} from './toWorkspace.js'

const exporters = {
    IMAGE: {GEE: startImageToAssetExport$, DRIVE: startImageToDriveExport$, SEPAL: startImageToWorkspaceExport$},
    TABLE: {GEE: startTableToAssetExport$, DRIVE: startTableToDriveExport$, SEPAL: startTableToWorkspaceExport$}
}

export const startEEObjectExport$ = ({export: spec, description}, context) => defer(() => {
    assertEEObjectExport(spec)
    const {kind, destination, expression, region, driveFolder: _driveFolder, filenamePrefix: _filenamePrefix, ...options} = spec
    const object = ee.Deserializer.decodeCloudApi(expression)
    const exportName = eeObjectTaskName(description)
    const filenamePrefix = eeObjectFilenamePrefix(spec, description)
    const output = {...options, description: exportName, folder: eeObjectDriveFolder(spec, description)}
    if (kind === 'IMAGE') {
        output.image = ee.Image(object)
        output.region = region ? ee.Geometry(ee.Deserializer.decodeCloudApi(region)) : output.image.geometry()
        // The exporters reduce regions to bounds. Without scaling, EE preserves the polygon mask.
        if (region && options.scale == null && options.dimensions == null) {
            output.image = output.image.clip(output.region)
        }
        if (typeof output.pyramidingPolicy === 'string') {
            output.pyramidingPolicy = {'.default': output.pyramidingPolicy}
        }
        output.fileNamePrefix = filenamePrefix
        if (destination === 'SEPAL') {
            output.folder = `${exportName}_${randomUUID()}`
        }
    } else {
        output.collection = ee.FeatureCollection(object)
        output.filenamePrefix = filenamePrefix
        if (destination === 'GEE' && options.selectors) {
            output.collection = output.collection.select(options.selectors)
        }
    }
    return exporters[kind][destination](output, context)
})
