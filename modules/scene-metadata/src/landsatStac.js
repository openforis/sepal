import {isSceneIncluded, getDataset, scene} from './landsat.js'
import {updateFromStac} from './stac.js'
import {getLogger} from '#sepal/log'
const log = getLogger('landsat')

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
    const dataset = getDataset(id)
    if (dataset) {
        if (isSceneIncluded({dataset, collectionCategory, cloudCover})) {
            return scene({id, dataset, wrsPath, wrsRow, acquiredTimestamp, cloudCover, sunAzimuth, sunElevation})
        }
    } else {
        log.debug(`Ignoring unexpected id: ${id}`)
    }
}

const updateLandsat = async ({redis, database, timestamp}) => {
    await updateFromStac({
        source: 'landsat-ot',
        dataset: 'LANDSAT_8',
        query: {
            'platform': {'eq': 'landsat-8'}
        },
        sceneMapper,
        redis,
        database,
        timestamp
    })
    await updateFromStac({
        source: 'landsat-ot',
        dataset: 'LANDSAT_9',
        query: {
            'platform': {'eq': 'landsat-9'}
        },
        sceneMapper,
        redis,
        database,
        timestamp
    })
}

export {updateLandsat}
