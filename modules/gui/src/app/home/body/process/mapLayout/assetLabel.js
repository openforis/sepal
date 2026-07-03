const assetBasename = asset => asset.substring(asset.lastIndexOf('/') + 1)

// Default display label for an EE asset: metadata title if available, otherwise the asset basename.
export const defaultAssetLabel = (asset, metadata) => {
    const properties = (metadata && metadata.properties) || {}
    return properties['system:title'] || (metadata && metadata.title) || assetBasename(asset)
}

// Decide the label to show when an asset loads: keep the current value only when the same asset is
// reloaded (preserving a user's edit for that asset); on any asset change, reset to the new default so
// a custom label can't leak from one asset to the next.
export const resolveAssetLabel = ({current, asset, labeledAsset, defaultLabel}) =>
    asset === labeledAsset ? current : defaultLabel
