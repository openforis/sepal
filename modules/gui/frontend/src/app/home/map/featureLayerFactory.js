import {createAoiLayer} from 'app/home/map/aoiLayer'
import LabelsLayer from 'app/home/map/labelsLayer'

export const createFeatureLayer = ({featureLayerSource, map, recipe, layerIndex}) => {
    switch(featureLayerSource.type) {
    case 'Labels': return new LabelsLayer({map, layerIndex})
    case 'Aoi': return createAoiLayer({map, recipe, layerIndex})
    default: throw Error(`Unsupported feature layer type: ${featureLayerSource.type}`)
    }
}
