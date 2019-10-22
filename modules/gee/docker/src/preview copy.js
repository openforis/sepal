const ee = require('@google/earthengine')

module.exports = value => {
    const image = ee.Image(value)
    const map = image.getMap({})
    return {
        mapId: map.mapid,
        token: map.token
    }
}
