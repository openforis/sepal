import {defer, map, tap} from 'rxjs'

import {getLogger} from '#sepal/log'

import {processCSV} from './csv.js'
import {download} from './filesystem.js'
import {getAcquiredTimestampFromId, getIdFromGranuleId, scene} from './sentinel2.js'
import {formatInterval} from './time.js'

const log = getLogger('sentinel2')

const CSV_URL = 'https://storage.googleapis.com/gcp-public-data-sentinel-2/index.csv.gz'

export const loadSentinel2$ = ({database, maxTimestamp, timestamp}) => defer(() => {
    log.debug('Loading Sentinel-2 data from CSV...')
    const t0 = Date.now()
    return defer(() => processCSV({
        collection: 'sentinel-2',
        sceneMapper,
        database,
        maxTimestamp,
        timestamp
    })).pipe(
        tap(() => log.info(`Loaded Sentinel-2 data from CSV (${formatInterval(t0)})`))
    )
})

export const downloadSentinel2$ = () => defer(() =>
    download({
        url: CSV_URL,
        collection: 'sentinel-2',
    })
).pipe(map(() => undefined))

const sceneMapper = ({
    'GRANULE_ID': granuleId,
    'PRODUCT_ID': productUri,
    'CLOUD_COVER': cloudCover,
    'SENSING_TIME': sensingTime
}) => {
    const id = getIdFromGranuleId(productUri, granuleId)
    if (id) {
        const acquiredTimestamp = sensingTime || getAcquiredTimestampFromId(id)
        return scene({id, productUri, acquiredTimestamp, cloudCover})
    }
    return null
}
