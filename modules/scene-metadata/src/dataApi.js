import {googleMapsApiKey, nicfiPlanetApiKey} from './config.js'
import {
    daysFromDayOfYear,
    parseBestScenesQuery,
    parseSceneAreaQuery,
    toDateString,
} from './sceneSearch.js'

export class DataApi {
    #sceneRepository

    constructor(sceneRepository) {
        this.#sceneRepository = sceneRepository
    }

    mapApiKeys(ctx) {
        ctx.body = {google: googleMapsApiKey, nicfiPlanet: nicfiPlanetApiKey}
    }

    // The client sends its whole query as a JSON string in one form field.
    async bestScenes(ctx) {
        const query = JSON.parse(ctx.request.body.query)
        const q = parseBestScenesQuery(query)
        const byArea = await this.#sceneRepository.findBestScenes(q)
        ctx.body = Object.fromEntries(
            Object.entries(byArea).map(([sceneAreaId, scenes]) => [
                sceneAreaId,
                scenes.map(scene => sceneData(scene, q.targetDayOfYear)),
            ])
        )
    }

    async scenesForArea(ctx) {
        const query = JSON.parse(ctx.query.query)
        const q = parseSceneAreaQuery(ctx.params.sceneAreaId, query)
        const scenes = await this.#sceneRepository.findScenesInSceneArea(q)
        ctx.body = scenes.map(scene => sceneData(scene, q.targetDayOfYear))
    }
}

const sceneData = (scene, targetDayOfYear) => ({
    id: scene.id,
    dataSet: scene.dataSet,
    date: toDateString(scene.acquisitionDate),
    cloudCover: scene.cloudCover,
    daysFromTarget: daysFromDayOfYear(scene.acquisitionDate, targetDayOfYear),
})
