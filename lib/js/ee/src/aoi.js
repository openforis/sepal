const ee = require('@google/earthengine')

const toGeometry = aoi => {
    switch (aoi.type) {
    case 'POLYGON':
        return polygon(aoi)
    case 'EE_TABLE':
        return eeTable(aoi)
    }
}

const polygon = ({path}) =>
    ee.Geometry({geoJson: ee.Geometry.Polygon({coords: [path]}), geodesic: false})

const eeTable = ({id, keyColumn, key}) => {
    const table = ee.FeatureCollection(id)
    const filters = [ee.Filter.eq(keyColumn, key)]
    if (!isNaN(key))
        filters.push(ee.Filter.eq(keyColumn, key.parseFloat()))

    return table
        .filter(ee.Filter.or(...filters))
        .geometry()
}

module.exports = {toGeometry}
