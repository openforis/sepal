const {getDayOfYear} = require('date-fns')
const {getSceneId, getSceneAreaId, browseUrl} = require('./sentinel2')
const {updateFromStac} = require('./stac')
const log = require('#sepal/log').getLogger('sentinel2')

const sceneMapper = ({
    properties: {
        's2:product_uri': productUri,
        'eo:cloud_cover': cloudCover,
        'datetime': acquiredTimestamp,
    }
}) => {
    const sceneId = getSceneId(productUri)
    return sceneId ? {
        sceneId,
        source: 'SENTINEL_2',
        dataSet: 'SENTINEL_2',
        sceneAreaId: getSceneAreaId(productUri),
        acquiredTimestamp,
        dayOfYear: getDayOfYear(acquiredTimestamp),
        cloudCover: parseFloat(cloudCover),
        sunAzimuth: 0,
        sunElevation: 0,
        thumbnailUrl: browseUrl(productUri)
    } : null
}

log.fatal(updateFromStac)

const updateSentinel2 = async ({redis, database, timestamp}) =>
    await updateFromStac({
        source: 'sentinel-2',
        sceneMapper,
        redis,
        database,
        timestamp
    })

module.exports = {updateSentinel2}
