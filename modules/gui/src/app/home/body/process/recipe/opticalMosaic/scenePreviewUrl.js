const sentinelHubPreview = sceneId => {
    const base = 'https://roda.sentinel-hub.com/sentinel-s2-l1c/tiles'
    const utmCode = sceneId.substring(33, 35)
    const latitudeBand = sceneId.substring(35, 36)
    const square = sceneId.substring(36, 38)
    const year = parseInt(sceneId.substring(0, 4))
    const month = parseInt(sceneId.substring(4, 6))
    const day = parseInt(sceneId.substring(6, 8))
    return `${base}/${utmCode}/${latitudeBand}/${square}/${year}/${month}/${day}/0/preview.jpg`
}

const planetaryComputerPreview = sceneId => {
    const base = 'https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png'
    const args = [
        'collection=landsat-c2-l2',
        `item=${sceneId}`,
        'assets=red',
        'assets=green',
        'assets=blue',
        'color_formula=gamma+RGB+2.7%2C+saturation+1.5%2C+sigmoidal+RGB+15+0.55',
        'format=png'
    ].join('&')
    return `${base}?${args}`
}

const SCENE_PREVIEW_URL = {
    SENTINEL_2: sentinelHubPreview,
    LANDSAT_TM: planetaryComputerPreview,
    LANDSAT_7: planetaryComputerPreview,
    LANDSAT_8: planetaryComputerPreview,
    LANDSAT_9: planetaryComputerPreview
}

export const getScenePreviewUrl = ({id, dataSet}) =>
    SCENE_PREVIEW_URL[dataSet] && SCENE_PREVIEW_URL[dataSet](id)

export const usgsLandsatPreview = landsatProductId => {
    const base = 'https://landsatlook.usgs.gov/gen-browse'
    const args = [
        'size=rrb',
        'type=refl',
        `product_id=${landsatProductId}`
    ].join('&')
    return `${base}?${args}`
}

const LANDSAT_PRODUCT_ID_MATCHER = /^(L[COTEM]0[1-9])_L(\d)\w+_(\d{6})_(\d{8})_\d{2}_(T1|T2|RT)$/

export const toGEEImageId = productId => {
    const match = productId?.match(LANDSAT_PRODUCT_ID_MATCHER)
    if (match) {
        const [, satellite, level, pathrow, date, tier] = match
        const collection = 'C02'
        const geeId = `LANDSAT/${satellite}/${collection}/${tier}_L${level}/${satellite}_${pathrow}_${date}`
        return geeId
    } else {
        throw new Error('Invalid Landsat Product ID format')
    }
}
