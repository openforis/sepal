const {parse, getDayOfYear} = require('date-fns')
const {getPrefix, getDatasetByPrefix, isSceneIncluded, getSceneAreaId, getCloudCover, isOperational} = require('./landsat')
const {processCSV} = require('./csv')
const {formatInterval} = require('./time')
const {download} = require('./filesystem')
const log = require('#sepal/log').getLogger('landsat')

const CSV_URL = {
    'landsat-ot': 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_OT_C2_L1.csv.gz',
    'landsat-etm': 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_ETM_C2_L1.csv.gz',
    'landsat-tm': 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_TM_C2_L1.csv.gz'
}

const sceneMapper = ({
    'Landsat Scene Identifier': sceneId,
    'WRS Path': wrsPath,
    'WRS Row': wrsRow,
    'Collection Category': collectionCategory,
    'Scene Cloud Cover L1': cloudCover,
    'Sun Azimuth L0RA': sunAzimuthL0,
    'Sun Azimuth L1': sunAzimuthL1,
    'Sun Elevation L0RA': sunElevationL0,
    'Sun Elevation L1': sunElevationL1,
    'Date Acquired': datetime,
    'Browse Link': thumbnailUrl
}, lastTimestamp) => {
    const prefix = getPrefix(sceneId)
    const dataSet = getDatasetByPrefix(prefix)
    if (dataSet) {
        if (isSceneIncluded({dataSet, collectionCategory, cloudCover})) {
            const acquiredTimestamp = parse(datetime, 'yyyy/MM/dd', new Date()).toISOString()
            return !lastTimestamp || acquiredTimestamp >= lastTimestamp ? {
                sceneId,
                source: 'LANDSAT',
                dataSet,
                sceneAreaId: getSceneAreaId(wrsPath, wrsRow),
                acquiredTimestamp,
                dayOfYear: getDayOfYear(datetime),
                cloudCover: getCloudCover(cloudCover, dataSet),
                sunAzimuth: parseFloat(sunAzimuthL0 || sunAzimuthL1),
                sunElevation: parseFloat(sunElevationL0 || sunElevationL1),
                thumbnailUrl
            } : null
        }
    } else {
        log.debug(`Unexpected scene id prefix ${prefix}, ignoring scene ${sceneId}`)
    }
}

const loadLandsatCollection = async ({collection, redis, database, timestamp, update}) => {
    if (!update || isOperational(collection)) {
        await processCSV({
            collection,
            sceneMapper,
            redis,
            database,
            timestamp,
            update
        }).catch(err => log.error('Error:', err))
    }
}

const loadLandsat = async ({redis, database, timestamp, update}) => {
    log.debug('Loading Landast data from CSV...')
    const t0 = Date.now()
    await loadLandsatCollection({collection: 'landsat-tm', redis, database, timestamp, update})
    await loadLandsatCollection({collection: 'landsat-etm', redis, database, timestamp, update})
    await loadLandsatCollection({collection: 'landsat-ot', redis, database, timestamp, update})
    log.info(`Loaded Landsat data from CSV (${formatInterval(t0)})`)
}

const downloadLandsatCollection = async collection =>
    await download({
        url: CSV_URL[collection],
        collection
    })

const downloadLandsat = async () =>
    await Promise.all([
        downloadLandsatCollection('landsat-tm'),
        downloadLandsatCollection('landsat-etm'),
        downloadLandsatCollection('landsat-ot')
    ])

module.exports = {downloadLandsat, loadLandsat}
