import {createAoiLayer} from 'app/home/map/aoiLayer'
import {selectFrom} from '../../../stateUtils'
import LabelsLayer from 'app/home/map/labelsLayer'

export const updateFeatureLayers = ({recipe, map, onAdd, selectedLayers = []}) => {
    const sources = selectFrom(recipe, 'ui.featureLayerSources') || []
    const sourceIds = selectedLayers.map(({sourceId}) => sourceId)
    sources.forEach((source, i) => {
        const isSelected = sourceIds.includes(source.id)
        if (isSelected) {
            const {layerConfig} = selectedLayers.find(({sourceId}) => source.id === sourceId)
            addFeatureLayer({map, source, recipe, layerConfig, layerIndex: i + 1, onAdd})
        } else {
            map.removeLayer(source.type)
        }
    })
}

const addFeatureLayer = ({map, source, recipe, layerConfig, layerIndex, onAdd}) => {
    const layer = createFeatureLayer({
        source,
        map,
        recipe,
        layerConfig,
        layerIndex
    })
    if (layer) {
        const id = source.type
        map.setLayer({id, layer})
        onAdd && onAdd(id)
    }
}

const createFeatureLayer = ({source, map, recipe, layerConfig, layerIndex}) => {
    switch(source.type) {
    case 'Labels': return new LabelsLayer({map, layerIndex})
    case 'Aoi': return createAoiLayer({map, recipe, layerConfig, layerIndex})
    default: throw Error(`Unsupported feature layer type: ${source.type}`)
    }
}
