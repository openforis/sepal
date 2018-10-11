import './map.module.css'
import {sepalMap} from './map'
import {setFusionTableLayer} from './fusionTable'
import {setPolygonLayer} from './polygonLayer'

export const countryFusionTable = '1iCjlLvNDpVtI80HpYrxEtjnw2w6sLEHX0QVTLqqU'

export const removeAoiLayer = contextId => {
    sepalMap.getContext(contextId).removeLayer('aoi')
}

export const setAoiLayer = ({contextId, aoi, fill, destroy$, onInitialized}) => {
    const layerId = 'aoi'
    switch (aoi && aoi.type) {
    case 'COUNTRY':
        return setFusionTableLayer({
            contextId,
            layerSpec: {
                id: layerId,
                tableId: countryFusionTable,
                keyColumn: 'id',
                key: aoi.areaCode || aoi.countryCode
            },
            bounds: aoi.bounds,
            fill,
            destroy$,
            onInitialized
        })
    case 'FUSION_TABLE':
        return setFusionTableLayer({
            contextId,
            layerSpec: {
                id: layerId,
                tableId: aoi.id,
                keyColumn: aoi.keyColumn,
                key: aoi.key
            },
            bounds: aoi.bounds,
            fill,
            destroy$,
            onInitialized
        })

    case 'POLYGON':
        return setPolygonLayer({
            contextId,
            layerSpec: {
                id: layerId,
                path: aoi.path
            },
            fill,
            destroy$,
            onInitialized
        })

    default:
        removeAoiLayer(contextId)
    }
}
