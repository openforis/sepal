const ee = require('#sepal/ee')
const _ = require('lodash')

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

module.exports = {toGeometry, toFeatureCollection}
