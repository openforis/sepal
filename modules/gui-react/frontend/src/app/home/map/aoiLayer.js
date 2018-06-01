import {setFusionTableLayer} from './fusionTable'
import {sepalMap} from './map'
import './map.module.css'
import {setPolygonLayer} from './polygonLayer'


export const countryFusionTable = '1iCjlLvNDpVtI80HpYrxEtjnw2w6sLEHX0QVTLqqU'

export const removeAoiLayer = (contextId) => {
    sepalMap.getContext(contextId).removeLayer('aoi')
}

export const setAoiLayer = ({contextId, aoi, destroy$, onInitialized}) => {
    const layerId = 'aoi'
    switch (aoi && aoi.type) {
        case 'country':
            return setFusionTableLayer({
                contextId,
                layerSpec: {
                    id: layerId,
                    tableId: countryFusionTable,
                    keyColumn: 'id',
                    key: aoi.areaCode || aoi.countryCode,
                    bounds: aoi.bounds
                },
                destroy$,
                onInitialized
            })
        case 'fusionTable':
            return setFusionTableLayer({
                contextId,
                layerSpec: {
                    id: layerId,
                    tableId: aoi.id,
                    keyColumn: aoi.keyColumn,
                    key: aoi.key,
                    bounds: aoi.bounds
                },
                destroy$,
                onInitialized
            })

        case 'polygon':
            return setPolygonLayer({
                contextId,
                layerSpec: {
                    id: layerId,
                    path: aoi.path
                },
                destroy$,
                onInitialized
            })
        default:
            removeAoiLayer(contextId)
    }
}

