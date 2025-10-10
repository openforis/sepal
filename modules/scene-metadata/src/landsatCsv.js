const {parse} = require('date-fns')
const {isSceneIncluded, isOperational, getDataset, scene} = require('./landsat')
const {processCSV, isInTimeRange} = require('./csv')
const {formatInterval} = require('./time')
const {download} = require('./filesystem')
const log = require('#sepal/log').getLogger('landsat')

// Note: rows are NOT in chronological order by acquisition date

const CSV_URL = {
    'landsat-ot': 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_OT_C2_L2.csv.gz',
    'landsat-etm': 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_ETM_C2_L2.csv.gz',
    'landsat-tm': 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_TM_C2_L2.csv.gz'
}

const sceneMapper = ({
    row: {
        'Landsat Product Identifier L2': productId,
        'WRS Path': wrsPath,
        'WRS Row': wrsRow,
        'Collection Category': collectionCategory,
        'Scene Cloud Cover L1': cloudCover,
        'Sun Azimuth L0RA': sunAzimuthL0,
        'Sun Azimuth L1': sunAzimuthL1,
        'Sun Elevation L0RA': sunElevationL0,
        'Sun Elevation L1': sunElevationL1,
        'Date Acquired': datetime
    },
    minTimestamp,
    maxTimestamp
}) => {
    const dataSet = getDataset(productId)
    if (dataSet) {
        if (isSceneIncluded({dataSet, collectionCategory, cloudCover})) {
            const id = productId.substring(0, 26) + productId.substring(35)
            const acquiredTimestamp = parse(datetime, 'yyyy/MM/dd', new Date()).toISOString()
            return id && isInTimeRange(acquiredTimestamp, minTimestamp, maxTimestamp)
                ? scene({
                    id,
                    dataSet,
                    wrsPath,
                    wrsRow,
                    acquiredTimestamp,
                    cloudCover,
                    sunAzimuth: sunAzimuthL0 || sunAzimuthL1,
                    sunElevation: sunElevationL0 || sunElevationL1
                })
                : null
        }
    } else {
        log.debug(`Ignoring unexpected id: ${productId}`)
    }
}

const loadLandsatCollection = async ({collection, redis, database, maxTimestamp, timestamp, update}) => {
    if (!update || isOperational(collection)) {
        await processCSV({
            collection,
            sceneMapper,
            redis,
            database,
            maxTimestamp,
            timestamp,
            update
        }).catch(err => log.error('Error:', err))
    }
}

const loadLandsat = async ({redis, database, maxTimestamp, timestamp, update}) => {
    log.debug('Loading Landast data from CSV...')
    const t0 = Date.now()
    await loadLandsatCollection({collection: 'landsat-tm', redis, database, maxTimestamp, timestamp, update})
    await loadLandsatCollection({collection: 'landsat-etm', redis, database, maxTimestamp, timestamp, update})
    await loadLandsatCollection({collection: 'landsat-ot', redis, database, maxTimestamp, timestamp, update})
    log.info(`Loaded Landsat data from CSV (${formatInterval(t0)})`)
}

const downloadLandsatCollection = async ({collection, update}) => {
    if (!update || isOperational(collection)) {
        await download({
            url: CSV_URL[collection],
            collection
        })
    }
}

const downloadLandsat = async update =>
    await Promise.all([
        downloadLandsatCollection({collection: 'landsat-tm', update}),
        downloadLandsatCollection({collection: 'landsat-etm', update}),
        downloadLandsatCollection({collection: 'landsat-ot', update})
    ])

module.exports = {downloadLandsat, loadLandsat}
