import './map.module.css'
import {sepalMap} from './map'
import {setEETableLayer} from './eeTableLayer'
import {setPolygonLayer} from './polygonLayer'

export const countryEETable = 'users/wiell/SepalResources/countries'

export const removeAoiLayer = contextId => {
    sepalMap.getContext(contextId).removeLayer('aoi')
}

export const setAoiLayer = ({contextId, aoi, fill, destroy$, onInitialized, layerIndex = 0}) => {
    const layerId = 'aoi'
    switch (aoi && aoi.type) {
    case 'COUNTRY':
        return setEETableLayer({
            contextId,
            layerSpec: {
                id: layerId,
                tableId: countryEETable,
                columnName: 'id',
                columnValue: aoi.areaCode || aoi.countryCode
            },
            destroy$,
            onInitialized,
            layerIndex
        })
    case 'EE_TABLE':
        return setEETableLayer({
            contextId,
            layerSpec: {
                id: layerId,
                tableId: aoi.id,
                columnName: aoi.keyColumn,
                columnValue: aoi.key
            },
            destroy$,
            onInitialized,
            layerIndex
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
