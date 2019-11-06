const ee = require('@google/earthengine')

const toGeometry = aoi => {
    console.log(aoi)
    switch (aoi.type) {
    case 'POLYGON':
        return polygon(aoi)
        // case ''
    }
}

const polygon = aoi =>
    ee.Geometry({geoJson: ee.Geometry.Polygon({coords: [aoi.path]}), geodesic: false})

module.exports = {toGeometry}
