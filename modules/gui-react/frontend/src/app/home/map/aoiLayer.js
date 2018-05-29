import FusionTable from './fusionTable'
import './map.module.css'
import Polygon from './polygon'
import {map} from './map'

export const countryFusionTable = '1iCjlLvNDpVtI80HpYrxEtjnw2w6sLEHX0QVTLqqU'

export const setAoiLayer = (contextId, aoi, onInitialized) => {
    const id = 'aoi'

    const setCountryLayer = () =>
        FusionTable.setLayer(contextId, {
            id,
            table: countryFusionTable,
            keyColumn: 'id',
            key: aoi.areaCode || aoi.countryCode,
            bounds: aoi.bounds
        }, onInitialized)

    const setFusionTableLayer = () =>
        FusionTable.setLayer(contextId, {
            id,
            table: aoi.id,
            keyColumn: aoi.keyColumn,
            key: aoi.key,
            bounds: aoi.bounds
        }, onInitialized)

    const setPolygonLayer = () =>
        Polygon.setLayer(contextId, {
            id,
            path: aoi.path
        }, onInitialized)

    switch (aoi && aoi.type) {
        case 'country':
            return setCountryLayer()
        case 'fusionTable':
            return setFusionTableLayer()
        case 'polygon':
            return setPolygonLayer()
        default:
            map.getLayers(contextId).set(id, null)

    }
}

