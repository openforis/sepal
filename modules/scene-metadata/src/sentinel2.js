const log = require('#sepal/log').getLogger('sentinel2')

const PRODUCT_URI_MATCHER = /^S2[ABC]_(?:(?:OPER_PRD_)?MSI(L1C|L2A)_(\d{8}T\d{6})_N\d{4}_R\d{3}_(T\d{2}[A-Z]{3})_(\d{8}T\d{6})(?:\.SAFE)?|OPER_PRD_MSI(L1C|L2A)_PDMC_(\d{8}T\d{6})_R\d{3}_V(\d{8}T\d{6})_(\d{8}T\d{6}))$/

const getSceneId = productUri => {
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

const awsPath = id => {
    const utmCode = id.substring(39, 41)
    const latitudeBand = id.substring(41, 42)
    const square = id.substring(42, 44)
    const year = parseInt(id.substring(11, 15))
    const month = parseInt(id.substring(15, 17))
    const day = parseInt(id.substring(17, 19))
    return `${utmCode}/${latitudeBand}/${square}/${year}/${month}/${day}/0`
}

const browseUrl = id => {
    const base = 'https://roda.sentinel-hub.com/sentinel-s2-l1c/tiles'
    return `${base}/${awsPath(id)}/preview.jpg`
}

module.exports = {getSceneId, getSceneAreaId, browseUrl}
