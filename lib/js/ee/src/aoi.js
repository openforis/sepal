const ee = require('#sepal/ee/ee')
const _ = require('lodash')
const {of} = require('rxjs')
const imageFactory = require('./imageFactory')

const toGeometry$ = aoi => {
    if (!aoi) {
        return of(null)
    }
    switch (aoi.type) {
        case 'POLYGON':
            return polygon$(aoi)
        case 'POINT':
            return point$(aoi)
        case 'EE_TABLE':
            return eeTable$(aoi)
        case 'ASSET':
            return asset$(aoi)
        case 'RECIPE':
            return recipe$(aoi)
        default:
            return of(aoi)
    }
}

const toFeatureCollection = aoi => {
    switch (aoi.type) {
        case 'POLYGON':
            return ee.FeatureCollection([ee.Feature(polygon$(aoi))])
        case 'EE_TABLE':
            return eeTable$(aoi)
    }
}

const polygon$ = ({path}) =>
    of(
        ee.Geometry({geoJson: ee.Geometry.Polygon({coords: [path]}), geodesic: false})
    )

const point$ = ({lat, lng}) =>
    of(
        ee.Geometry({geoJson: ee.Geometry.Point([lng, lat])})
    )

const eeTable$ = ({id, keyColumn, key, buffer}) => {
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
                .geometry()
        } else {
            return table.geometry()
        }
    }
    const table = getTable()
    return of(
        buffer
            ? table.map(feature => feature.buffer(ee.Number(buffer).multiply(1000)))
            : table
    )
}

const asset$ = ({id}) => imageFactory({
    type: 'ASSET',
    id
}).getGeometry$()

const recipe$ = ({id}) => imageFactory({
    type: 'RECIPE_REF',
    id
}).getGeometry$()

module.exports = {toGeometry$, toFeatureCollection}
