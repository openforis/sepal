import {googleMapsApiKey, nicfiPlanetApiKey} from './config.js'
import {findBestScenes, findScenesInSceneArea} from './sceneRepository.js'
import {
    daysFromDayOfYear,
    parseBestScenesQuery,
    parseSceneAreaQuery,
    toDateString,
} from './sceneSearch.js'

const sceneData = (scene, targetDayOfYear) => ({
    id: scene.id,
    dataSet: scene.dataSet,
    date: toDateString(scene.acquisitionDate),
    cloudCover: scene.cloudCover,
    daysFromTarget: daysFromDayOfYear(scene.acquisitionDate, targetDayOfYear),
})

// GET /map-api-keys

const mapApiKeys = ctx => {
    ctx.body = {google: googleMapsApiKey, nicfiPlanet: nicfiPlanetApiKey}
}

// POST /best-scenes — body form field `query` is a JSON string.

const bestScenes = async ctx => {
    const query = JSON.parse(ctx.request.body.query)
    const q = parseBestScenesQuery(query)
    const byArea = await findBestScenes(q)
    ctx.body = Object.fromEntries(
        Object.entries(byArea).map(([sceneAreaId, scenes]) => [
            sceneAreaId,
            scenes.map(s => sceneData(s, q.targetDayOfYear)),
        ])
    )
}

// GET /sceneareas/:sceneAreaId — query param `query` is a JSON string.

const scenesForArea = async ctx => {
    const query = JSON.parse(ctx.query.query)
    const q = parseSceneAreaQuery(ctx.params.sceneAreaId, query)
    const scenes = await findScenesInSceneArea(q)
    ctx.body = scenes.map(s => sceneData(s, q.targetDayOfYear))
}

export {bestScenes, mapApiKeys, scenesForArea}
