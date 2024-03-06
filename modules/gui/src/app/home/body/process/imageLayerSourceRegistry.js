const registry = {}

export const addImageLayerSource = (type, imageLayerSource) =>
    registry[type] = imageLayerSource

export const getImageLayerSource = ({source, recipe, layerConfig, map, boundsChanged$, dragging$, cursor$}) => {
    if (!source) {
        return {}
    }
    const {type} = source
    const imageLayerSource = registry[type]
    if (imageLayerSource) {
        return imageLayerSource({source, recipe, layerConfig, map, boundsChanged$, dragging$, cursor$})
    } else {
        throw Error(`Unsupported image layer source type: ${type}`)
    }
}
