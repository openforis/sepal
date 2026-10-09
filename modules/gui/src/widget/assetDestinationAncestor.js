const CONTAINER_TYPES = ['Folder', 'ImageCollection']

// Exports create missing parent folders, but Earth Engine cannot place an asset inside an existing image or table
export const findNonContainerAncestor = (assetId, assets) =>
    assets.find(({id, type}) => assetId.startsWith(`${id}/`) && type && !CONTAINER_TYPES.includes(type))
