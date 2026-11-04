import {exportFolderName, sanitizeEarthEngineTaskName} from './earthEngineExportNames.js'

// Earth Engine refuses a task description over 100 characters.
const MAX_TASK_NAME_LENGTH = 100

// task-manager resolves where an export lands when it records the task, so taskInfo names that place whichever
// client submitted it. Resolving resolved params again changes nothing.
export const eeObjectTaskParams = params => {
    const spec = params?.export
    if (!isObject(spec)) {
        return params
    }
    const resolved = resolvedExport(spec, params.description)
    return {
        ...params,
        export: resolved,
        taskInfo: {
            ...(isObject(params.taskInfo) ? params.taskInfo : {}),
            kind: spec.kind,
            destination: spec.destination,
            outputPath: outputPath(resolved),
            filenamePrefix: resolved.filenamePrefix
        }
    }
}

export const eeObjectWorkspacePath = (spec, description) =>
    homeRelative(spec.workspacePath) || `downloads/${eeObjectTaskName(description)}`

export const eeObjectDriveFolder = (spec, description) =>
    exportFolderName(spec.driveFolder || description)

export const eeObjectFilenamePrefix = (spec, description) =>
    spec.filenamePrefix ? exportFolderName(spec.filenamePrefix) : eeObjectTaskName(description)

export const eeObjectTaskName = description =>
    sanitizeEarthEngineTaskName(description).slice(0, MAX_TASK_NAME_LENGTH)

// The table formats SEPAL exports, under every spelling Earth Engine accepts for them.
export const eeTableFormat = fileFormat => {
    const key = typeof fileFormat === 'string' ? fileFormat.toUpperCase() : null
    return Object.hasOwn(TABLE_FORMATS, key) ? TABLE_FORMATS[key] : undefined
}

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
    if (spec.kind === 'TABLE' && spec.destination !== 'GEE' && spec.fileFormat != null && !eeTableFormat(spec.fileFormat)) {
        throw new Error(`Unsupported table export fileFormat: ${spec.fileFormat}; expected CSV, GeoJSON, KML, KMZ or SHP`)
    }
    if (spec.kind === 'TABLE' && spec.destination !== 'DRIVE' && spec.maxVertices != null) {
        throw new Error(`maxVertices is not supported by the existing ${spec.destination} table exporter`)
    }
}

const resolvedExport = (spec, description) => {
    switch (spec.destination) {
        case 'SEPAL': return {
            ...spec,
            workspacePath: eeObjectWorkspacePath(spec, description),
            filenamePrefix: eeObjectFilenamePrefix(spec, description)
        }
        case 'DRIVE': return {
            ...spec,
            driveFolder: eeObjectDriveFolder(spec, description),
            filenamePrefix: eeObjectFilenamePrefix(spec, description)
        }
        default: return spec
    }
}

const outputPath = ({destination, assetId, driveFolder, workspacePath}) =>
    ({GEE: assetId, DRIVE: driveFolder, SEPAL: workspacePath})[destination]

// Python users write ~/path for a folder in their home; workspace paths are relative to it.
const homeRelative = path =>
    typeof path === 'string' && /^~(\/|$)/.test(path)
        ? path.replace(/^~\/*/, '') || '.'
        : path

const assertExpression = (value, name) => {
    if (!value || typeof value !== 'object' || typeof value.result !== 'string'
        || !value.values || typeof value.values !== 'object' || !Object.hasOwn(value.values, value.result)) {
        throw new Error(`export ${name} must be a Cloud API expression object`)
    }
}

const isObject = value =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

const TABLE_FORMATS = {
    CSV: 'CSV',
    GEOJSON: 'GeoJSON',
    GEO_JSON: 'GeoJSON',
    JSON: 'GeoJSON',
    KML: 'KML',
    KMZ: 'KMZ',
    SHP: 'SHP'
}
