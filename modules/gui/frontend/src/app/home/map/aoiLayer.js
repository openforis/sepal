import {EETableLayer, setEETableLayer} from './eeTableLayer'
import {PolygonLayer, setPolygonLayer} from './polygonLayer'
import React from 'react'
import api from 'api'

export const countryEETable = 'users/wiell/SepalResources/countries'

export const removeAoiLayer = map => {
    map.removeLayer('aoi')
}

export const createAoiLayer = ({map, recipe, layerConfig = {}, layerIndex}) => {
    const aoi = layerConfig.aoi || recipe.model.aoi
    if (!aoi) {
        return null
    }
    const aoiType = aoi.type
    const color = '#FFFFFF50'
    const fillColor = '#FFFFFF08'
    switch (aoiType) {
    case 'COUNTRY':
        return new EETableLayer({
            map,
            mapId$: api.gee.eeTableMap$({
                tableId: countryEETable,
                columnName: 'id',
                columnValue: aoi.areaCode || aoi.countryCode,
                buffer: aoi.buffer,
                color,
                fillColor
            }),
            layerIndex,
            watchedProps: aoi
        })
    case 'EE_TABLE':
        return new EETableLayer({
            map,
            mapId$: api.gee.eeTableMap$({
                tableId: aoi.id,
                columnName: aoi.keyColumn,
                columnValue: aoi.key,
                buffer: aoi.buffer,
                color,
                fillColor
            }),
            layerIndex,
            watchedProps: aoi
        })
    case 'POLYGON':
        return new PolygonLayer({
            map,
            path: aoi.path,
            fill: false, // TODO: Should fill sometimes
            color,
            fillColor
        })

    default:
        throw Error(`Unsupported AOI type: ${aoiType}`)
    }
}

export const setAoiLayer = ({map, aoi, fill, destroy$, onInitialized, layerIndex = 1}) => {
    const layerId = 'aoi'
    switch (aoi && aoi.type) {
    case 'COUNTRY':
        return setEETableLayer({
            map,
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
            map,
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
            map,
            layerSpec: {
                id: layerId,
                path: aoi.path
            },
            fill,
            destroy$,
            onInitialized
        })

    default:
        removeAoiLayer(map)
    }
}
