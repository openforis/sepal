import FusionTable from './fusionTable'
import './map.module.css'
import Polygon from './polygon'

export const countryFusionTable = '1iCjlLvNDpVtI80HpYrxEtjnw2w6sLEHX0QVTLqqU'

export const setAoiLayer = (aoi, onInitialized) => {
    const id = 'aoi'

    const setCountryLayer = () =>
        FusionTable.setLayer({
            id,
            table: countryFusionTable,
            keyColumn: 'id',
            key: aoi.areaCode || aoi.countryCode
        }, onInitialized)

    const setFusionTableLayer = () =>
        FusionTable.setLayer({
            id,
            table: aoi.id,
            keyColumn: aoi.keyColumn,
            key: aoi.key
        }, onInitialized)

    const setPolygonLayer = () =>
        Polygon.setLayer({
            id,
            path: aoi.path
        }, onInitialized)

    switch (aoi.type) {
        case 'country':
            return setCountryLayer()
        case 'fusionTable':
            return setFusionTableLayer()
        case 'polygon':
            return setPolygonLayer()
        default:
            throw new Error(`Invalid aoi type: ${aoi.type}`)
    }
}

