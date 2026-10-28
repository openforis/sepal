// Earth Engine REST requests, built with the client library's own serializer and naming so that each one
// matches the request the library itself would send.

const OPERATIONS_PAGE_SIZE = 500

export const computeValue = (ee, eeObject, {projectId, workloadTag}) => ({
    method: 'POST',
    path: `v1/projects/${projectId}/value:compute`,
    body: {expression: ee.Serializer.encodeCloudApi(eeObject), ...workloadTagOf(workloadTag)}
})

export const createMap = (ee, image, visParams, {projectId, workloadTag}) => {
    if (!(image instanceof ee.Image)) {
        throw new Error('A map can only be created from an ee.Image')
    }
    const request = ee.data.images.applyVisualization(image, {...visParams, format: 'png'})
    if (ee.rpc_convert.visualizationOptions(request)) {
        throw new Error(`Unsupported visualization parameters: ${JSON.stringify(visParams)}`)
    }
    return {
        method: 'POST',
        path: `v1/projects/${projectId}/maps`,
        query: {fields: 'name', ...workloadTagOf(workloadTag)},
        body: {
            expression: ee.Serializer.encodeCloudApi(request.image),
            fileFormat: ee.rpc_convert.fileFormat(request.format),
            bandIds: ee.rpc_convert.bandList(request.bands)
        }
    }
}

export const getAsset = (ee, eeId) => ({
    method: 'GET',
    path: `v1/${ee.rpc_convert.assetIdToAssetName(eeId)}`,
    query: {prettyPrint: 'false'}
})

export const listAssets = (ee, parentEEId, pageToken) => ({
    method: 'GET',
    path: ee.rpc_convert.CLOUD_ASSET_ROOT_RE.test(parentEEId)
        ? `v1/${ee.rpc_convert.projectParentFromPath(parentEEId)}:listAssets`
        : `v1/${ee.rpc_convert.assetIdToAssetName(parentEEId)}:listAssets`,
    query: {view: 'BASIC', ...(pageToken ? {pageToken} : {})}
})

export const listBuckets = projectId => ({
    method: 'GET',
    path: `v1/${projectId}:listAssets`
})

export const deleteAsset = (ee, eeId) => ({
    method: 'DELETE',
    path: `v1/${ee.rpc_convert.assetIdToAssetName(eeId)}`
})

export const moveAsset = (ee, fromEEId, toEEId) => ({
    method: 'POST',
    path: `v1/${ee.rpc_convert.assetIdToAssetName(fromEEId)}:move`,
    body: {destinationName: ee.rpc_convert.assetIdToAssetName(toEEId)}
})

export const createFolder = (parentId, assetId) => ({
    method: 'POST',
    path: `v1/${parentId}`,
    query: {assetId},
    body: {type: 'FOLDER'}
})

export const createImageCollection = (ee, assetId, properties = {}) => {
    const name = ee.rpc_convert.assetIdToAssetName(assetId)
    const [, parent, id] = name.match(/^(projects\/[^/]+)\/assets\/(.+)$/)
    return {method: 'POST', path: `v1/${parent}/assets`, query: {assetId: id}, body: {type: 'IMAGE_COLLECTION', properties}}
}

// As the library's setAssetProperties: legacy system keys become asset fields, null removes a property, and
// the update mask names the declared fields, then each remaining property quoted.
export const setAssetProperties = (ee, assetId, properties) => {
    const asset = ee.rpc_convert.legacyPropertiesToAssetUpdate(properties)
    const declaredFields = asset.getClassMetadata().keys
        .filter(key => key !== 'properties' && asset.Serializable$has(key))
        .map(key => key.replace(/([A-Z])/g, (_all, capital) => `_${capital.toLowerCase()}`))
    const propertyFields = Object.keys(asset.properties ?? {}).map(key => `properties."${key}"`)
    return {
        method: 'PATCH',
        path: `v1/${ee.rpc_convert.assetIdToAssetName(assetId)}`,
        body: {asset: ee.apiclient.serialize(asset), updateMask: [...declaredFields, ...propertyFields].join(',')}
    }
}

export const listOperations = ({projectId}, pageToken) => ({
    method: 'GET',
    path: `v1/projects/${projectId}/operations`,
    query: {pageSize: OPERATIONS_PAGE_SIZE, ...(pageToken ? {pageToken} : {})}
})

export const getOperation = (ee, taskId) => ({
    method: 'GET',
    path: `v1/${ee.rpc_convert.taskIdToOperationName(taskId)}`
})

export const cancelOperation = (ee, taskId) => ({
    method: 'POST',
    path: `v1/${ee.rpc_convert.taskIdToOperationName(taskId)}:cancel`,
    body: {}
})

export const exportTable = (ee, task, taskId, {projectId, workloadTag}) => {
    const {expression: _expression, ...options} = plain(
        ee.rpc_convert_batch.taskToExportTableRequest({...task.config_, id: taskId, workloadTag})
    )
    return {
        method: 'POST',
        path: `v1/projects/${projectId}/table:export`,
        body: {...options, expression: ee.Serializer.encodeCloudApi(task.config_.element)}
    }
}

// As the library's own startProcessing prepares it: crs, scale and region are applied to the image itself.
export const exportImage = (ee, task, taskId, {projectId, workloadTag}) => {
    const imageTask = ee.data.images.applyTransformsToImage({...task.config_, id: taskId})
    const {expression: _expression, ...options} = plain(ee.rpc_convert_batch.taskToExportImageRequest(imageTask))
    return {
        method: 'POST',
        path: `v1/projects/${projectId}/image:export`,
        body: {...options, ...workloadTagOf(workloadTag), expression: ee.Serializer.encodeCloudApi(imageTask.element)}
    }
}

export const setAssetIamPolicy = (assetId, policy) => ({
    method: 'POST',
    path: `v1/${assetId}:setIamPolicy`,
    body: {policy}
})

const workloadTagOf = workloadTag =>
    workloadTag ? {workloadTag} : {}

// A library request object as plain JSON, without the fields left unset. Not for expressions: there a null
// constant is a value, and only ee.Serializer keeps it.
const plain = value =>
    Array.isArray(value)
        ? value.map(plain)
        : value && typeof value === 'object'
            ? Object.fromEntries(
                Object.entries(value.Serializable$values ?? value)
                    .filter(([_key, fieldValue]) => fieldValue !== null && fieldValue !== undefined)
                    .map(([key, fieldValue]) => [key, plain(fieldValue)])
            )
            : value
