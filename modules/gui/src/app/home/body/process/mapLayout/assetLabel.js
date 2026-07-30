const assetBasename = asset => asset.substring(asset.lastIndexOf('/') + 1)

// Default display label for an EE asset: metadata title if available, otherwise the asset basename.
export const defaultAssetLabel = (asset, metadata) => {
    const properties = (metadata && metadata.properties) || {}
    return properties['system:title'] || (metadata && metadata.title) || assetBasename(asset)
}

// User-facing label for a summary UI (Layer sources, map-area panel), derived at render time so saved
// sources needn't carry a label. An explicit non-blank label wins; then the metadata title; then the asset
// basename. The full EE asset id (`projects/.../assets/foo`) is never shown - only its basename (`foo`) -
// unless the asset string has no slash at all, in which case it's already a bare name.
export const assetDisplayLabel = ({label, asset, metadata} = {}) => {
    const explicit = typeof label === 'string' ? label.trim() : ''
    return explicit || defaultAssetLabel(asset || '', metadata)
}

// Decide the label to show when an asset loads: keep the current value only when the same asset is
// reloaded (preserving a user's edit for that asset); on any asset change, reset to the new default so
// a custom label can't leak from one asset to the next.
export const resolveAssetLabel = ({current, asset, labeledAsset, defaultLabel}) =>
    asset === labeledAsset ? current : defaultLabel
