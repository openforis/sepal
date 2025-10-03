const {getDayOfYear} = require('date-fns')
const {getPrefix, getDatasetByPrefix, isSceneIncluded, getSceneAreaId, getCloudCover} = require('./landsat')
const {updateFromStac} = require('./stac')
const log = require('#sepal/log').getLogger('landsat')

const sceneMapper = ({
    properties: {
        'landsat:scene_id': sceneId,
        'landsat:wrs_path': wrsPath,
        'landsat:wrs_row': wrsRow,
        'landsat:collection_category': collectionCategory,
        'landsat:cloud_cover_land': cloudCover,
        'view:sun_azimuth': sunAzimuth,
        'view:sun_elevation': sunElevation,
        'datetime': datetime,
    },
    links
}, lastTimestamp) => {
    const prefix = getPrefix(sceneId)
    const dataSet = getDatasetByPrefix(prefix)
    const thumbnailUrl = links?.find(link => link.rel === 'thumbnail')?.href
    if (dataSet) {
        if (isSceneIncluded({dataSet, collectionCategory, cloudCover})) {
            const acquiredTimestamp = datetime
            return !lastTimestamp || acquiredTimestamp >= lastTimestamp ? {
                sceneId,
                source: 'LANDSAT',
                dataSet,
                sceneAreaId: getSceneAreaId(wrsPath, wrsRow),
                acquiredTimestamp,
                dayOfYear: getDayOfYear(datetime),
                cloudCover: getCloudCover(cloudCover, dataSet),
                sunAzimuth: parseFloat(sunAzimuth),
                sunElevation: parseFloat(sunElevation),
                thumbnailUrl
            } : null
        }
    } else {
        log.debug(`Unexpected scene id prefix ${prefix}, ignoring scene ${sceneId}`)
    }
}

const updateLandsat = async ({redis, database, timestamp}) =>
    await updateFromStac({
        source: 'landsat-ot',
        sceneMapper,
        redis,
        database,
        timestamp
    })

module.exports = {updateLandsat}
