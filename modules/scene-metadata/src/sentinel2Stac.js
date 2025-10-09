const {getId, scene} = require('./sentinel2')
const {updateFromStac} = require('./stac')

const sceneMapper = ({
    properties: {
        's2:product_uri': productUri,
        'eo:cloud_cover': cloudCover,
        'datetime': acquiredTimestamp,
    }
}) => {
    const id = getId(productUri)
    return id
        ? scene({id, productUri, acquiredTimestamp, cloudCover})
        : null
}

const updateSentinel2 = async ({redis, database, timestamp}) =>
    await updateFromStac({
        source: 'sentinel-2',
        sceneMapper,
        redis,
        database,
        timestamp
    })

module.exports = {updateSentinel2}
