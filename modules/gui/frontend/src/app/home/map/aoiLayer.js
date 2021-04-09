import {EETableLayer, setEETableLayer} from './eeTableLayer'
import {PolygonLayer, setPolygonLayer} from './polygonLayer'
import {of} from 'rxjs'
import api from 'api'

export const countryEETable = 'users/wiell/SepalResources/countries'

export const removeAoiLayer = map => {
    map.removeLayer('aoi')
}

export const createAoiLayer = ({map, recipe, layerIndex}) => {
    const aoi = recipe.model.aoi
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

export const getBounds$ = ({aoi, google}) => {
    switch(aoi.type) {
    case 'COUNTRY': return eeTableBounds$({
        tableId: countryEETable,
        columnName: 'id',
        columnValue: aoi.areaCode || aoi.countryCode,
        buffer: aoi.buffer,
    })
    case 'EE_TABLE': return eeTableBounds$({
        tableId: aoi.id,
        columnName: aoi.keyColumn,
        columnValue: aoi.key,
        buffer: aoi.buffer
    })
    case 'POLYGON': return polygonBounds$({
        path: aoi.path,
        google
    })
    default: throw Error(`Unsupported AOI type: ${aoi.type}`)
    }
}

const eeTableBounds$ = aoi => {
    return api.gee.getAoiBounds$({aoi})
}

const polygonBounds$ = ({path, google}) => {
    const polygon = new google.maps.Polygon({
        paths: path.map(([lng, lat]) =>
            new google.maps.LatLng(lat, lng)
        )
    })
    const googleBounds = new google.maps.LatLngBounds()
    polygon.getPaths().getArray().forEach(path =>
        path.getArray().forEach(latLng =>
            googleBounds.extend(latLng)
        ))
    const bounds = fromGoogleBounds(googleBounds)
    return of(bounds)
}

const fromGoogleBounds = googleBounds => {
    const sw = googleBounds.getSouthWest()
    const ne = googleBounds.getNorthEast()
    return [
        [sw.lng(), sw.lat()],
        [ne.lng(), ne.lat()]
    ]
}
