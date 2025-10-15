const {getDayOfYear} = require('date-fns')
const log = require('#sepal/log').getLogger('sentinel2')

const PRODUCT_URI_MATCHER = /^S2[ABC]_(?:(?:OPER_PRD_)?MSI(L1C|L2A)_(\d{8}T\d{6})_N\d{4}_R\d{3}_(T\d{2}[A-Z]{3})_(\d{8}T\d{6})(?:\.SAFE)?)$/

const getId = (productUri, processedTimestamp) => {
    const match = productUri.match(PRODUCT_URI_MATCHER)
    if (match) {
        const [acquisitionTimestamp, sceneArea] = match.slice(2)
        return [acquisitionTimestamp, processedTimestamp, sceneArea].join('_')
    } else {
        log.debug('Unexpected product-uri format:', productUri)
    }
}

const getIdFromGranuleId = (productUri, granuleId) =>
    getId(productUri, granuleId.substring(19, 34))

const getIdFromDatastripId = (productUri, datastripId) =>
    getId(productUri, datastripId.substring(42, 57))

const getSceneAreaId = productUri =>
    productUri.substring(39, 39 + 5)

const scene = ({id, productUri, acquiredTimestamp, cloudCover}) => ({
    id,
    source: 'SENTINEL_2',
    dataSet: 'SENTINEL_2',
    sceneAreaId: getSceneAreaId(productUri),
    acquiredTimestamp,
    dayOfYear: getDayOfYear(acquiredTimestamp),
    cloudCover: parseFloat(cloudCover),
    sunAzimuth: 0,
    sunElevation: 0
})

module.exports = {getIdFromDatastripId, getIdFromGranuleId, scene}
