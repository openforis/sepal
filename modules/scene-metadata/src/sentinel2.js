const {getDayOfYear} = require('date-fns')
const log = require('#sepal/log').getLogger('sentinel2')

const PRODUCT_URI_MATCHER = /^S2[ABC]_(?:(?:OPER_PRD_)?MSI(L1C|L2A)_(\d{8}T\d{6})_N\d{4}_R\d{3}_(T\d{2}[A-Z]{3})_(\d{8}T\d{6})(?:\.SAFE)?|OPER_PRD_MSI(L1C|L2A)_PDMC_(\d{8}T\d{6})_R\d{3}_V(\d{8}T\d{6})_(\d{8}T\d{6}))$/

const getId = productUri => {
    const match = productUri.match(PRODUCT_URI_MATCHER)
    if (match) {
        const [acquisitionTimestamp, sceneArea, processingTimestamp] = match.slice(2)
        return [acquisitionTimestamp, processingTimestamp, sceneArea].join('_')
    } else {
        log.debug('Unexpected product-uri format:', productUri)
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

module.exports = {getId, scene}
