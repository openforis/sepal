// Pure helpers for the map-area feature overlay list. `featureLayers` is the persisted per-area draw
// order: [{sourceId, disabled?, layerConfig?}]. Built-in overlays keep their fixed relative order;
// user-added EE table asset overlays are reorderable and are always grouped into a single contiguous
// band (the popup selector and the map stack both rely on that). Helpers preserve each entry's
// layerConfig and return unchanged entries by reference.

export const withFeatureLayerDisabled = (featureLayers, sourceId, disabled) =>
    featureLayers.map(featureLayer =>
        featureLayer.sourceId === sourceId
            ? {...featureLayer, disabled}
            : featureLayer
    )

// Reorder the asset entries into `orderedAssetIds` order and group them into one contiguous band placed
// where the first asset currently sits; built-in entries keep their relative order around the band.
// `assetSourceIds` is the complete set of orderable (asset) source ids - the asset slots are derived from
// it, not from `orderedAssetIds`. `orderedAssetIds` is the desired order but is treated defensively:
// unknown/duplicate/absent ids are ignored, and any asset omitted from it keeps its prior relative order
// appended after the given ones. Idempotent.
export const withReorderedAssets = (featureLayers, assetSourceIds, orderedAssetIds) => {
    const assetIds = new Set(assetSourceIds)
    const firstAsset = featureLayers.findIndex(({sourceId}) => assetIds.has(sourceId))
    if (firstAsset === -1) {
        return featureLayers
    }
    const entryById = new Map(featureLayers.map(featureLayer => [featureLayer.sourceId, featureLayer]))
    const priorOrder = featureLayers.map(({sourceId}) => sourceId).filter(sourceId => assetIds.has(sourceId))
    const seen = new Set()
    const assetOrder = []
    for (const sourceId of [...orderedAssetIds, ...priorOrder]) {
        if (assetIds.has(sourceId) && entryById.has(sourceId) && !seen.has(sourceId)) {
            seen.add(sourceId)
            assetOrder.push(sourceId)
        }
    }
    return [
        ...featureLayers.slice(0, firstAsset),
        ...assetOrder.map(sourceId => entryById.get(sourceId)),
        ...featureLayers.slice(firstAsset).filter(({sourceId}) => !assetIds.has(sourceId))
    ]
}

// Group all asset entries into one contiguous band without changing their relative order. Used by the
// synchronizer to normalize state where appended sources interleaved a built-in between assets.
export const canonicalizeFeatureLayerOrder = (featureLayers, assetSourceIds) =>
    withReorderedAssets(featureLayers, assetSourceIds, [])

// Compute the asset order while dragging `draggedId`: place it at the slot its pointer is over, based on
// each asset row's vertical center (top-to-bottom). `pointerY` null (e.g. released outside the list) keeps
// the current order. Operates only on asset ids, so built-ins are never introduced.
export const reorderAssetsByPointer = ({assetIds, draggedId, pointerY, centers}) => {
    if (pointerY == null) {
        return assetIds
    }
    const others = assetIds.filter(sourceId => sourceId !== draggedId)
    const insertAt = others.filter(sourceId => centers[sourceId] < pointerY).length
    return [...others.slice(0, insertAt), draggedId, ...others.slice(insertAt)]
}
