import {sanitizeEarthEngineTaskName} from './earthEngineExportNames.js'

export const eeObjectWorkspacePath = (spec, description) =>
    spec.workspacePath || `downloads/${sanitizeEarthEngineTaskName(description)}`

export const assertEEObjectExport = spec => {
    if (!['IMAGE', 'TABLE'].includes(spec?.kind)) {
        throw new Error('Unsupported export kind: expected IMAGE or TABLE')
    }
    if (!['GEE', 'DRIVE', 'SEPAL'].includes(spec.destination)) {
        throw new Error('Unsupported export destination: expected GEE, DRIVE or SEPAL')
    }
    assertExpression(spec.expression, 'expression')
    if (spec.region != null) {
        assertExpression(spec.region, 'region')
    }
    if (spec.destination === 'GEE' && !spec.assetId) {
        throw new Error('assetId is required for a GEE export')
    }
    if (spec.assetType === 'ImageCollection') {
        throw new Error('ImageCollection assets require a tiled recipe export')
    }
    if (spec.kind === 'TABLE' && spec.destination !== 'GEE' && spec.fileFormat != null
        && !['CSV', 'GeoJSON', 'KML', 'KMZ', 'SHP'].includes(spec.fileFormat)) {
        throw new Error(`Unsupported table export fileFormat: ${spec.fileFormat}; expected CSV, GeoJSON, KML, KMZ or SHP`)
    }
    if (spec.kind === 'TABLE' && spec.destination !== 'DRIVE' && spec.maxVertices != null) {
        throw new Error(`maxVertices is not supported by the existing ${spec.destination} table exporter`)
    }
}

const assertExpression = (value, name) => {
    if (!value || typeof value !== 'object' || typeof value.result !== 'string'
        || !value.values || typeof value.values !== 'object' || !Object.hasOwn(value.values, value.result)) {
        throw new Error(`export ${name} must be a Cloud API expression object`)
    }
}
