import {SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import Http from 'http-client'
import moment from 'moment'
import {map} from 'rxjs/operators'
import {msg} from 'translate'

const api = {
    gee: {
        preview$: (recipe) =>
            Http.postJson$('gee/preview', transformRecipeForPreview(recipe), {retries: 0}),
        sceneAreas$: ({aoi, source}) =>
            Http.get$('gee/sceneareas?' + transformQueryForSceneAreas(aoi, source)).pipe(
                map(e =>
                    e.response.map(sceneArea =>
                        ({id: sceneArea.sceneAreaId, polygon: sceneArea.polygon})
                    )
                )
            ),
        scenesInSceneArea$: ({sceneAreaId, dates, sources, sceneSelectionOptions}) =>
            Http.get$(`api/data/sceneareas/${sceneAreaId}?`
                + transformQueryForScenesInSceneArea({dates, sources})).pipe(
                map(({response: scenes}) =>
                    scenes
                        .map((scene) => transformOldSceneToNew(sceneAreaId, dates, scene))
                        .filter(({dataSet}) => Object.values(sources)[0].includes(dataSet))
                        .sort((scene1, scene2) => {
                            const weightOf = (scene) => {
                                const weight = sceneSelectionOptions.targetDateWeight
                                return (1 - weight) * scene.cloudCover / 100 + weight * Math.abs(scene.daysFromTarget) / 183
                            }
                            return weightOf(scene1) - weightOf(scene2)
                        })
                )
            ),
        autoSelectScenes$: (recipe) =>
            Http.post$('/api/data/best-scenes', {
                body: {
                    targetDayOfYearWeight: recipe.sceneSelectionOptions.targetDateWeight,
                    cloudCoverTarget: 0.0001,
                    minScenes: recipe.ui.sceneCount.min,
                    maxScenes: recipe.ui.sceneCount.max,
                    dataSet: sourcesToDataSet(recipe.sources),
                    sceneAreaIds: recipe.ui.sceneAreas.map(sceneArea => sceneArea.id).join(','),
                    sensorIds: toSensors(recipe.sources).join(','),
                    fromDate: fromDate(recipe.dates),
                    toDate: toDate(recipe.dates),
                    targetDayOfYear: targetDayOfYear(recipe.dates)
                }
            }).pipe(
                map(({response: scenesBySceneArea}) => {
                        Object.keys(scenesBySceneArea).forEach((sceneAreaId) =>
                            scenesBySceneArea[sceneAreaId] = scenesBySceneArea[sceneAreaId].map((sceneOldFormat) => {
                                    const scene = transformOldSceneToNew(sceneAreaId, recipe.dates, sceneOldFormat)
                                    return {
                                        id: scene.id,
                                        dataSet: scene.dataSet,
                                        date: scene.date,
                                        cloudCover: scene.cloudCover
                                    }
                                }
                            )
                        )
                        return scenesBySceneArea
                    }
                )
            ),
        retrieveMosaic: (recipe) =>
            Http.postJson$('/api/tasks', transformRecipeForRetrieval(recipe))
                .subscribe()
    },
    recipe: {
        loadAll$: () =>
            Http.get$('/processing-recipes').pipe(
                map(e => e.response)
            ),
        save$: (recipe) =>
            Http.post$(`/processing-recipes/${recipe.id}`, {body: {data: JSON.stringify(recipe)}})
        ,
        delete$: (recipeId) =>
            Http.delete$(`/processing-recipes/${recipeId}`),
        load$: (recipeId) =>
            Http.get$(`/processing-recipes/${recipeId}`).pipe(
                map(e => e.response)
            ),
    }
}
export default api

const DATE_FORMAT = 'YYYY-MM-DD'

const transformRecipeForPreview = (recipe) => {
    const sceneIds = []
    if (recipe.sceneSelectionOptions.type === SceneSelectionType.SELECT)
        Object.keys(recipe.scenes).forEach(sceneAreaId => recipe.scenes[sceneAreaId].forEach(scene => sceneIds.push(scene.id)))
    return {
        aoi: transformAoi(recipe.aoi),
        dates: recipe.dates,
        dataSet: sourcesToDataSet(recipe.sources),
        sensors: toSensors(recipe.sources),
        targetDayOfYearWeight: recipe.compositeOptions.dayOfYearPercentile / 100,
        shadowTolerance: 1 - recipe.compositeOptions.shadowPercentile / 100,
        hazeTolerance: 1 - recipe.compositeOptions.hazePercentile / 100,
        greennessWeight: recipe.compositeOptions.ndviPercentile / 100,
        bands: recipe.bands,
        panSharpening: !!recipe.panSharpen,
        surfaceReflectance: recipe.compositeOptions.corrections.includes('SR'),
        medianComposite: recipe.compositeOptions.compose === 'MEDIAN',
        brdfCorrect: recipe.compositeOptions.corrections.includes('BRDF'),
        maskClouds: recipe.compositeOptions.mask.includes('CLOUDS'),
        maskSnow: recipe.compositeOptions.mask.includes('SNOW'),
        sceneIds: sceneIds,
        type: recipe.sceneSelectionOptions.type === SceneSelectionType.ALL ? 'automatic' : 'manual'
    }
}

const transformRecipeForRetrieval = (recipe) => {
    const name = recipe.title || recipe.placeholder
    const taskTitle = msg(['process.mosaic.panel.retrieve.form.task', recipe.ui.retrieveOptions.destination], {name})
    return {
        'operation': 'sepal.image.sepal_export',
        'params':
            {
                title: taskTitle,
                description: name,
                image: transformRecipeForPreview(recipe)
            }
    }
}

const transformOldSceneToNew = (sceneAreaId, dates, {sceneId, sensor, acquisitionDate, cloudCover, browseUrl}) => ({
    id: sceneId,
    sceneAreaId,
    dataSet: transformBackDataSet(sensor),
    date: acquisitionDate,
    daysFromTarget: daysFromTarget(acquisitionDate, dates),
    cloudCover: Math.round(cloudCover),
    browseUrl
})

const transformQueryForSceneAreas = (aoi, source) =>
    `aoi=${JSON.stringify(transformAoi(aoi))}&dataSet=${sourceToDataSet(source)}`

const transformQueryForScenesInSceneArea = ({dates, sources}) =>
    'dataSet=' + sourceToDataSet(Object.keys(sources)[0])
    + '&targetDayOfYear=' + targetDayOfYear(dates)
    + '&fromDate=' + fromDate(dates)
    + '&toDate=' + toDate(dates)


const targetDayOfYear = (dates) =>
    moment(dates.targetDate, DATE_FORMAT).dayOfYear()

const fromDate = (dates) =>
    moment(dates.seasonStart, DATE_FORMAT).subtract(dates.yearsBefore, 'years').format(DATE_FORMAT)

const toDate = (dates) =>
    moment(dates.seasonEnd, DATE_FORMAT).add(dates.yearsAfter, 'years').format(DATE_FORMAT)

const daysFromTarget = (dateString, dates) => {
    const date = moment(dateString, DATE_FORMAT)
    const targetDate = moment(dates.targetDate, DATE_FORMAT)
    const diffs = [
        date.diff(moment(targetDate).year(date.year() - 1), 'days'),
        date.diff(moment(targetDate).year(date.year()), 'days'),
        date.diff(moment(targetDate).year(date.year() + 1), 'days'),
    ]

    const min = Math.min(...diffs.map(Math.abs))
    return diffs.find(diff => Math.abs(diff) === min)
}

const transformAoi = (aoi) => {
    switch (aoi.type) {
        case 'fusionTable':
            return {
                type: 'fusionTable',
                tableName: aoi.id,
                keyColumn: aoi.keyColumn,
                keyValue: aoi.key
            }
        case 'polygon':
            return {
                type: 'polygon',
                path: aoi.path
            }
        default:
            throw new Error('Invalid AOI type: ', aoi)
    }
}

const toSensors = (sources) =>
    Object.values(sources)[0].map((dataSet) => {
        switch (dataSet) {
            case 'landsat8':
                return 'LANDSAT_8'
            case 'landsat7':
                return 'LANDSAT_7'
            case 'landsat45':
                return 'LANDSAT_TM'
            case 'landsat8T2':
                return 'LANDSAT_8_T2'
            case 'landsat7T2':
                return 'LANDSAT_7_T2'
            case 'landsat45T2':
                return 'LANDSAT_TM_T2'
            case 'sentinel2':
                return 'SENTINEL2A'
            default:
                throw new Error('Invalid dataSet: ' + dataSet)
        }
    })

const transformBackDataSet = (dataSet) => {
    switch (dataSet) {
        case 'LANDSAT_8':
            return 'landsat8'
        case 'LANDSAT_7':
            return 'landsat7'
        case 'LANDSAT_TM':
            return 'landsat45'
        case 'LANDSAT_8_T2':
            return 'landsat8T2'
        case 'LANDSAT_7_T2':
            return 'landsat7T2'
        case 'LANDSAT_TM_T2':
            return 'landsat45T2'
        case 'SENTINEL2A':
            return 'sentinel2'
        default:
            throw new Error('Invalid dataSet: ' + dataSet)
    }
}

const sourcesToDataSet = (sources) =>
    sources.landsat ? 'LANDSAT' : 'SENTINEL2'

const sourceToDataSet = (source) =>
    source === 'landsat' ? 'LANDSAT' : 'SENTINEL2'