import {get$, postForm$, postJson$} from 'http-client'
import {map} from 'rxjs/operators'
import moment from 'moment'

export default {
    preview$: ({recipe, ...params}) =>
        postJson$('/api/gee/preview', {body: {recipe, ...params}, retries: 0}),
    sceneAreas$: ({aoi, source}) =>
        get$('/api/gee/sceneareas', {query: {
            aoi: JSON.stringify(aoi),
            dataSet: sourceToDataSet(source)
        }}).pipe(
            map(e =>
                e.response.map(sceneArea =>
                    ({id: sceneArea.sceneAreaId, polygon: sceneArea.polygon})
                )
            )
        ),
    scenesInSceneArea$: ({sceneAreaId, dates, sources, sceneSelectionOptions}) =>
        get$(`/api/data/sceneareas/${sceneAreaId}`, {
            query: {
                dataSet: sourceToDataSet(Object.keys(sources)[0]),
                targetDayOfYear: targetDayOfYear(dates)
            }
        }).pipe(
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
        postForm$('/api/data/best-scenes', {
            body: {
                targetDayOfYearWeight: recipe.model.sceneSelectionOptions.targetDateWeight,
                cloudCoverTarget: 0.0001,
                minScenes: recipe.ui.sceneCount.min,
                maxScenes: recipe.ui.sceneCount.max,
                dataSet: sourcesToDataSet(recipe.model.sources),
                sceneAreaIds: recipe.ui.sceneAreas.map(sceneArea => sceneArea.id).join(','),
                sensorIds: toSensors(recipe.model.sources).join(','),
                fromDate: fromDate(recipe.model.dates),
                toDate: toDate(recipe.model.dates),
                targetDayOfYear: targetDayOfYear(recipe.model.dates)
            }
        }).pipe(
            map(({response: scenesBySceneArea}) => {
                Object.keys(scenesBySceneArea).forEach((sceneAreaId) =>
                    scenesBySceneArea[sceneAreaId] = scenesBySceneArea[sceneAreaId].map((sceneOldFormat) => {
                        const scene = transformOldSceneToNew(sceneAreaId, recipe.model.dates, sceneOldFormat)
                        return {
                            id: scene.id,
                            dataSet: scene.dataSet,
                            date: scene.date
                        }
                    }
                    )
                )
                return scenesBySceneArea
            }
            )
        )
}

const DATE_FORMAT = 'YYYY-MM-DD'

const transformOldSceneToNew = (sceneAreaId, dates, {sceneId, sensor, acquisitionDate, cloudCover, browseUrl}) => ({
    id: sceneId,
    sceneAreaId,
    dataSet: transformBackDataSet(sensor),
    date: acquisitionDate,
    daysFromTarget: daysFromTarget(acquisitionDate, dates),
    cloudCover: Math.round(cloudCover),
    browseUrl
})

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

const toSensors = (sources) =>
    Object.values(sources)[0].map((dataSet) => {
        if (dataSet === 'SENTINEL_2')
            return 'SENTINEL2A'
        else
            return dataSet
    })

const transformBackDataSet = (dataSet) => {
    if (dataSet === 'SENTINEL2A')
        return 'SENTINEL_2'
    else
        return dataSet
}

const sourcesToDataSet = (sources) =>
    sources.LANDSAT ? 'LANDSAT' : 'SENTINEL2'

const sourceToDataSet = (source) =>
    source === 'LANDSAT' ? 'LANDSAT' : 'SENTINEL2'
