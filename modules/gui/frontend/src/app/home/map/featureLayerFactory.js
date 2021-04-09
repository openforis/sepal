import {createAoiLayer} from 'app/home/map/aoiLayer'
import LabelsLayer from 'app/home/map/labelsLayer'

export const createFeatureLayer = ({type, map, recipe, layerIndex}) => {
    switch(type) {
    case 'Labels': return new LabelsLayer({map, layerIndex})
    case 'Aoi': return createAoiLayer({map, recipe, layerIndex})
    default: throw Error(`Unsupported feature layer type: ${type}`)
    }
}
