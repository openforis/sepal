const {getDayOfYear} = require('date-fns')
const log = require('#sepal/log').getLogger('sentinel2')

const PRODUCT_URI_MATCHER = /^S2[ABC]_(?:(?:OPER_PRD_)?MSI(L1C|L2A)_(?<acquisitionTimestamp>\d{8}T\d{6})_N\d{4}_R\d{3}_(?<sceneArea>T\d{2}[A-Z]{3})_\d{8}T\d{6}(?:\.SAFE)?)$/
const SHORT_GRANULE_ID_MATCHER = /^(L1C|L2A)_T\d{2}[A-Z]{3}_A\d{6}_(?<processedTimestamp>\d{8}T\d{6})$/
const LONG_GRANULE_ID_MATCHER = /^S2[ABC]_OPER_MSI_(L1C|L2A)_TL_[A-Z]{3}__(?<processedTimestamp>\d{8}T\d{6})_A\d{6}_T[0-9A-Z]{5}_N\d{2}\.\d{2}$/
const DATASTRIP_ID_MATCHER = /^S2[ABC]_OPER_MSI_(L1C|L2A)_DS_[A-Z0-9]{4}_\d{8}T\d{6}_S(?<processedTimestamp>\d{8}T\d{6})_N\d{2}\.\d{2}$/

const getId = (productUri, processedTimestamp) => {
    const match = productUri.match(PRODUCT_URI_MATCHER)
    if (match) {
        const {acquisitionTimestamp, sceneArea} = match.groups
        return [acquisitionTimestamp, processedTimestamp, sceneArea].join('_')
    } else {
        log.debug('Unexpected product uri format:', productUri)
    }
}

const getIdFromGranuleId = (productUri, granuleId) => {
    const match = granuleId.match(SHORT_GRANULE_ID_MATCHER) || granuleId.match(LONG_GRANULE_ID_MATCHER)
    if (match) {
        const {processedTimestamp} = match.groups
        return getId(productUri, processedTimestamp)
    } else {
        log.warn('Unexpected granule id format:', granuleId)
    }
}
    
const getIdFromDatastripId = (productUri, datastripId) => {
    const match = datastripId.match(DATASTRIP_ID_MATCHER)
    if (match) {
        const {processedTimestamp} = match.groups
        return getId(productUri, processedTimestamp)
    } else {
        log.warn('Unexpected datastrip id format:', datastripId)
    }
}

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
