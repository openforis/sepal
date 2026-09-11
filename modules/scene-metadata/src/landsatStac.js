import {concatMap, from} from 'rxjs'

import {getLogger} from '#sepal/log'

import {getDataset, isSceneIncluded, scene} from './landsat.js'
import {updateFromStac$} from './stac.js'

const log = getLogger('landsat')

export const updateLandsat$ = ({redis, database, timestamp}) => from([8, 9]).pipe(
    concatMap(number => updateFromStac$({
        source: 'landsat-ot',
        dataset: `LANDSAT_${number}`,
        query: {platform: {eq: `landsat-${number}`}},
        sceneMapper,
        redis,
        database,
        timestamp
    }))
)

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
