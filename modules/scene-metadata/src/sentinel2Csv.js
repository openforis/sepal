const {scene, getIdFromGranuleId} = require('./sentinel2')
const {processCSV, isInTimeRange} = require('./csv')
const {formatInterval} = require('./time')
const {download} = require('./filesystem')
const log = require('#sepal/log').getLogger('sentinel2')

const CSV_URL = 'https://storage.googleapis.com/gcp-public-data-sentinel-2/index.csv.gz'

const sceneMapper = ({
    row: {
        'GRANULE_ID': granuleId,
        'PRODUCT_ID': productUri,
        'CLOUD_COVER': cloudCover,
        'SENSING_TIME': acquiredTimestamp
    },
    minTimestamp,
    maxTimestamp
}) => {
    const id = getIdFromGranuleId(productUri, granuleId)
    return id && isInTimeRange(acquiredTimestamp, minTimestamp, maxTimestamp)
        ? scene({id, productUri, acquiredTimestamp, cloudCover})
        : null
}

const loadSentinel2 = async ({redis, database, maxTimestamp, timestamp, update}) => {
    log.debug('Loading Sentinel-2 data from CSV...')
    const t0 = Date.now()
    await processCSV({
        collection: 'sentinel-2',
        sceneMapper,
        redis,
        database,
        maxTimestamp,
        timestamp,
        update
    }).catch(err => log.error('Error:', err))
    log.info(`Loaded Sentinel-2 data from CSV (${formatInterval(t0)})`)
}

const downloadSentinel2 = async () =>
    await download({
        url: CSV_URL,
        collection: 'sentinel-2',
    })

module.exports = {downloadSentinel2, loadSentinel2}
