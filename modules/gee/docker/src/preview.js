const ee = require('@google/earthengine')

module.exports = (value, onError, onComplete) => {
    console.log('Running EE preview')
    const image = ee.Image(value)
    const map = image.getMap({})
    onComplete({
        mapId: map.mapid,
        token: map.token
    })
}
