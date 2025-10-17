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
