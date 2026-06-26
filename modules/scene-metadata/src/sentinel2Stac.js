import {getIdFromDatastripId, scene} from './sentinel2.js'
import {updateFromStac} from './stac.js'

const sceneMapper = ({
    properties: {
        's2:product_uri': productUri,
        's2:datastrip_id': datastripId,
        'eo:cloud_cover': cloudCover,
        'datetime': acquiredTimestamp,
    }
}) => {
    const id = getIdFromDatastripId(productUri, datastripId)
    return id
        ? scene({id, productUri, acquiredTimestamp, cloudCover})
        : null
}

const updateSentinel2 = async ({redis, database, timestamp}) =>
    await updateFromStac({
        source: 'sentinel-2',
        dataset: 'SENTINEL_2',
        sceneMapper,
        redis,
        database,
        timestamp
    })

export {updateSentinel2}
