import {setEETableLayer} from './eeTableLayer'
import {setPolygonLayer} from './polygonLayer'

export const countryEETable = 'users/wiell/SepalResources/countries'

export const removeAoiLayer = sepalMap => {
    sepalMap.removeLayer('aoi')
}

export const setAoiLayer = ({mapContext, aoi, fill, destroy$, onInitialized, layerIndex = 1}) => {
    const layerId = 'aoi'
    switch (aoi && aoi.type) {
    case 'COUNTRY':
        return setEETableLayer({
            mapContext,
            layerSpec: {
                id: layerId,
                tableId: countryEETable,
                columnName: 'id',
                columnValue: aoi.areaCode || aoi.countryCode,
                buffer: aoi.buffer,
                layerIndex
            },
            destroy$,
            onInitialized
        })
    case 'EE_TABLE':
        return setEETableLayer({
            mapContext,
            layerSpec: {
                id: layerId,
                tableId: aoi.id,
                columnName: aoi.keyColumn,
                columnValue: aoi.key,
                buffer: aoi.buffer,
                layerIndex
            },
            destroy$,
            onInitialized
        })
    case 'POLYGON':
        return setPolygonLayer({
            mapContext,
            layerSpec: {
                id: layerId,
                path: aoi.path
            },
            fill,
            destroy$,
            onInitialized
        })

    default:
        removeAoiLayer(mapContext.sepalMap)
    }
}
