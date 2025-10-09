const {isSceneIncluded, getDataset, scene} = require('./landsat')
const {updateFromStac} = require('./stac')
const log = require('#sepal/log').getLogger('landsat')

const sceneMapper = ({
    id,
    properties: {
        'landsat:wrs_path': wrsPath,
        'landsat:wrs_row': wrsRow,
        'landsat:collection_category': collectionCategory,
        'landsat:cloud_cover_land': cloudCover,
        'view:sun_azimuth': sunAzimuth,
        'view:sun_elevation': sunElevation,
        'datetime': acquiredTimestamp,
    }
}) => {
    const dataSet = getDataset(id)
    if (dataSet) {
        if (isSceneIncluded({dataSet, collectionCategory, cloudCover})) {
            return scene({id, dataSet, wrsPath, wrsRow, acquiredTimestamp, cloudCover, sunAzimuth, sunElevation})
        }
    } else {
        log.debug(`Ignoring unexpected id: ${id}`)
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
