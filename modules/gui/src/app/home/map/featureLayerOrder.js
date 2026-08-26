// Pure helpers for the map-area feature overlay list. `featureLayers` is the persisted per-area draw
// order from bottom to top: [{sourceId, disabled?, layerConfig?}]. Helpers preserve each entry's
// layerConfig and return unchanged entries by reference.

// The closed classification of the feature layer types that exist, bottom to top. It is a taxonomy, not a
// capability model: adding a type means deciding which band it belongs to here.
//
// Data is one band because Aoi and EETableAsset are ordered together by dragging, so ordering must leave
// their relative order alone. Each fixed row is its own band because its position is a rendering fact
// rather than a preference: Google draws the marker pane above the labels overlay, and scene areas belong
// above both. Presentation is last only so canonicalization has a deterministic place to park it - those
// types are not stack rows at all and never appear in the ordered list.
const DATA_TYPES = ['Aoi', 'EETableAsset']
const FIXED_TYPES = ['Labels', 'ReferenceData', 'SceneAreas']
const PRESENTATION_TYPES = ['Legend', 'Palette', 'Values']

export const isDataFeatureLayer = type => DATA_TYPES.includes(type)

export const isPresentationFeatureLayer = type => PRESENTATION_TYPES.includes(type)

// The two direction conversions. Persistence and the map stack run bottom-to-top; the menu reads
// top-to-bottom. These are the only places the direction flips, and they must stay inverses: drop one and
// the first drag silently inverts the map stack relative to the list the user dragged in.
export const toDisplayedFeatureLayers = featureLayers => [...featureLayers].reverse()

export const toPersistedDataOrder = displayedDataIds => [...displayedDataIds].reverse()

export const withFeatureLayerDisabled = (featureLayers, sourceId, disabled) =>
    featureLayers.map(featureLayer =>
        featureLayer.sourceId === sourceId
            ? {...featureLayer, disabled}
            : featureLayer
    )

// Reorder the data entries into `orderedDataIds` order and group them into one contiguous band placed
// where the first data entry currently sits; fixed entries keep their relative order around the band.
// `dataSourceIds` is the complete set of draggable source ids - the band's slots are derived from it, not
// from `orderedDataIds`. `orderedDataIds` is the desired order but is treated defensively: unknown,
// duplicate and absent ids are ignored, and any data layer omitted from it keeps its prior relative order
// appended after the given ones. Idempotent.
export const withReorderedDataLayers = (featureLayers, dataSourceIds, orderedDataIds) => {
    const dataIds = new Set(dataSourceIds)
    const firstData = featureLayers.findIndex(({sourceId}) => dataIds.has(sourceId))
    if (firstData === -1) {
        return featureLayers
    }
    const entryById = new Map(featureLayers.map(featureLayer => [featureLayer.sourceId, featureLayer]))
    const priorOrder = featureLayers.map(({sourceId}) => sourceId).filter(sourceId => dataIds.has(sourceId))
    const seen = new Set()
    const dataOrder = []
    for (const sourceId of [...orderedDataIds, ...priorOrder]) {
        if (dataIds.has(sourceId) && entryById.has(sourceId) && !seen.has(sourceId)) {
            seen.add(sourceId)
            dataOrder.push(sourceId)
        }
    }
    return [
        ...featureLayers.slice(0, firstData),
        ...dataOrder.map(sourceId => entryById.get(sourceId)),
        ...featureLayers.slice(firstData).filter(({sourceId}) => !dataIds.has(sourceId))
    ]
}

// Sort every entry into its band while leaving the order within a band alone, so a data layer the user
// dragged - the aoi included - stays where they put it. A type nobody has classified yet ranks just below
// presentation, so a new type joins the stack instead of vanishing from it.
export const canonicalizeFeatureLayerOrder = (featureLayers, featureLayerSources) => {
    const typeById = new Map(featureLayerSources.map(({id, type}) => [id, type]))
    const band = ({sourceId}) => {
        const type = typeById.get(sourceId)
        if (isPresentationFeatureLayer(type)) {
            return FIXED_TYPES.length + 2
        }
        if (isDataFeatureLayer(type)) {
            return 0
        }
        const fixed = FIXED_TYPES.indexOf(type)
        return fixed === -1
            ? FIXED_TYPES.length + 1
            : fixed + 1
    }
    return [...featureLayers].sort((a, b) => band(a) - band(b))
}

// Compute the data order while dragging `draggedId`: place it at the slot its pointer is over, based on
// each data row's vertical center (top-to-bottom). `pointerY` null (e.g. released outside the list) keeps
// the current order. Operates only on data ids, so a fixed row is never introduced.
export const reorderDataLayersByPointer = ({dataIds, draggedId, pointerY, centers}) => {
    if (pointerY == null) {
        return dataIds
    }
    const others = dataIds.filter(sourceId => sourceId !== draggedId)
    const insertAt = others.filter(sourceId => centers[sourceId] < pointerY).length
    return [...others.slice(0, insertAt), draggedId, ...others.slice(insertAt)]
}
