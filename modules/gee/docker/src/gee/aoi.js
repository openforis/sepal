const ee = require('@google/earthengine')

const toGeometry = aoi => {
    return ee.Geometry({geoJson: ee.Geometry.Polygon({coords: [aoi.path]}), geodesic: false})
}

module.exports = {toGeometry}
