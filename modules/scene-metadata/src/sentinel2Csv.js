const {getDayOfYear} = require('date-fns')
const {getSceneId, getSceneAreaId, browseUrl} = require('./sentinel2')
const {processCSV} = require('./csv')
const {formatInterval} = require('./time')
const {download} = require('./filesystem')
const log = require('#sepal/log').getLogger('sentinel2')

const CSV_URL = 'https://storage.googleapis.com/gcp-public-data-sentinel-2/index.csv.gz'

const sceneMapper = ({
    'PRODUCT_ID': productUri,
    'CLOUD_COVER': cloudCover,
    'SENSING_TIME': acquiredTimestamp
}, lastTimestamp) => {
    const sceneId = getSceneId(productUri)
    return sceneId && (!lastTimestamp || acquiredTimestamp >= lastTimestamp) ? {
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

const loadSentinel2 = async ({redis, database, timestamp, update}) => {
    log.debug('Loading Sentinel-2 data from CSV...')
    const t0 = Date.now()
    await processCSV({
        collection: 'sentinel-2',
        sceneMapper,
        redis,
        database,
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
