import _ from 'lodash'
import {of} from 'rxjs'

import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'

// Async resolver for AOI geometry. ASSET/RECIPE AOIs reference images whose geometry must be resolved
// asynchronously via imageFactory(...).getGeometry$(); everything else falls through to the sync
// toGeometry path. Kept separate from toGeometry so existing sync consumers stay unchanged.
const toGeometry$ = aoi => {
    if (!aoi) {
        return of(null)
    }
    switch (aoi.type) {
        case 'ASSET':
            return imageFactory({type: 'ASSET', id: aoi.id}).getGeometry$()
        case 'RECIPE':
            return imageFactory({type: 'RECIPE_REF', id: aoi.id}).getGeometry$()
        default:
            return of(toGeometry(aoi))
    }
}

const toGeometry = aoi => {
    if (!aoi) {
        return null
    }
    switch (aoi.type) {
        case 'POLYGON':
            return polygon(aoi)
        case 'POINT':
            return point(aoi)
        case 'EE_TABLE':
            return eeTable(aoi).geometry()
        default:
            return aoi
    }
}

const toFeatureCollection = aoi => {
    switch (aoi.type) {
        case 'POLYGON':
            return ee.FeatureCollection([ee.Feature(polygon(aoi))])
        case 'EE_TABLE':
            return eeTable(aoi)
    }
}

const polygon = ({path}) =>
    ee.Geometry({geoJson: ee.Geometry.Polygon({coords: [path]}), geodesic: false})

const point = ({lat, lng}) =>
    ee.Geometry({geoJson: ee.Geometry.Point([lng, lat])})

const eeTable = ({id, keyColumn, key, buffer}) => {
    const getTable = () => {
        const table = ee.FeatureCollection(id)
        if (keyColumn) {
            const filters = [ee.Filter.eq(keyColumn, key)]
            if (_.isFinite(_.toNumber(key))) {
                filters.push(ee.Filter.eq(keyColumn, _.toNumber(key)))
            }
            return table
                .limit(table.size())
                .filter(ee.Filter.or(...filters))
        } else {
            return table
        }
    }
    const table = getTable()
    return buffer
        ? table.map(feature => feature.buffer(ee.Number(buffer).multiply(1000)))
        : table
}

export {toFeatureCollection, toGeometry, toGeometry$}
