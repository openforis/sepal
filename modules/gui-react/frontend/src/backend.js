import {SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import {delete$, get$, post$, postJson$} from 'http-client'
import {gzip$} from 'gzip'
import {map, switchMap} from 'rxjs/operators'
import {msg} from 'translate'
import _ from 'lodash'
import moment from 'moment'


const api = {
    user: {
        loadCurrentUser$: () =>
            get$('/api/user/current', {
                validStatuses: [200, 401]
            }).pipe(toResponse),
        login$: (username, password) =>
            post$('/api/user/login', {
                username, password,
                validStatuses: [200, 401]
            }).pipe(toResponse),
        requestPasswordReset$: (email) =>
            post$('/api/user/password/reset-request', {
                body: {email}
            }),
        validateToken$: (token) =>
            post$('/api/user/validate-token', {
                body: {token}
            }),
        resetPassword$: (token, username, password) =>
            post$('/api/user/password/reset', {
                body: {token, password}
            }),
        logout$: () =>
            null, // TODO: Implement...
        updateUserDetails$: ({name, email, organization}) =>
            post$('/api/user/current/details', {
                body: {name, email, organization}
            }),
        changePassword$: ({oldPassword, newPassword}) =>
            post$('/api/user/current/password', {
                body: {oldPassword, newPassword}
            })
    },
    files: {
        loadFiles$: (path) =>
            get$('/api/files?path=' + encodeURIComponent(path))
                .pipe(toResponse),
        removeItem$: (path) =>
            delete$('/api/files/' + encodeURIComponent(path))
                .pipe(toResponse)

    },
    apps: {
        loadAll$: () =>
            get$('/api/apps').pipe(toResponse),
        requestSession$: (endpoint) => post$(`/api/sandbox/start?endpoint=${endpoint ? endpoint : 'shiny'}`),
        waitForSession$: (endpoint) => get$(`/api/sandbox/start?endpoint=${endpoint ? endpoint : 'shiny'}`),
    },
    terminal: {
        init$: () =>
            get$('/api/gateone/auth-object')
                .pipe(toResponse)
    },
    map: {
        loadApiKey$: () =>
            get$('/api/data/google-maps-api-key')
                .pipe(toResponse)
    },
    gee: {
        preview$: (recipe) =>
            postJson$('/api/gee/preview', transformRecipeForPreview(recipe), {retries: 0}),
        sceneAreas$: ({aoi, source}) =>
            get$('/api/gee/sceneareas?' + transformQueryForSceneAreas(aoi, source)).pipe(
                map(e =>
                    e.response.map(sceneArea =>
                        ({id: sceneArea.sceneAreaId, polygon: sceneArea.polygon})
                    )
                )
            ),
        scenesInSceneArea$: ({sceneAreaId, dates, sources, sceneSelectionOptions}) =>
            get$(`/api/data/sceneareas/${sceneAreaId}?`
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
            post$('/api/data/best-scenes', {
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
            ),
        retrieveMosaic: (recipe) =>
            postJson$('/api/tasks', transformRecipeForRetrieval(recipe))
                .subscribe(),
        retrieveClassification: (recipe) =>
            postJson$('/api/tasks', transformRecipeForRetrieval(recipe))
                .subscribe()
    },
    recipe: {
        loadAll$: () =>
            get$('/api/processing-recipes')
                .pipe(toResponse),
        save$: (recipe) => {
            const name = recipe.title || recipe.placeholder
            return gzip$(_.omit(recipe, ['ui'])).pipe(
                switchMap(contents =>
                    post$(`/api/processing-recipes/${recipe.id}?type=${recipe.type}&name=${name}`, {
                        body: contents,
                        headers: {'Content-Type': 'application/octet-stream'}
                    })
                ),
                map(() => recipe)
            )
        },
        delete$: (recipeId) =>
            delete$(`/api/processing-recipes/${recipeId}`),
        load$: (recipeId) =>
            get$(`/api/processing-recipes/${recipeId}`)
                .pipe(toResponse),
    },
    tasks: {
        loadAll$: () =>
            get$('/api/tasks')
                .pipe(toResponse),
        submit$: (task) =>
            postJson$('/api/tasks', task),
        restart$: (taskId) =>
            post$(`/api/tasks/task/${taskId}/execute`),
        cancel$: (taskId) =>
            post$(`/api/tasks/task/${taskId}/cancel`),
        remove$: (taskId) =>
            post$(`/api/tasks/task/${taskId}/remove`),
        removeAll$: () =>
            post$('/api/tasks/remove')
    }
}
export default api

const DATE_FORMAT = 'YYYY-MM-DD'

const transformRecipeForPreview = (recipe) => {
    const sceneIds = []
    if (recipe.model.sceneSelectionOptions.type === SceneSelectionType.SELECT)
        Object.keys(recipe.model.scenes).forEach(sceneAreaId => recipe.model.scenes[sceneAreaId].forEach(scene => sceneIds.push(scene.id)))
    return {
        aoi: transformAoi(recipe.model.aoi),
        dates: recipe.model.dates,
        dataSet: sourcesToDataSet(recipe.model.sources),
        sensors: toSensors(recipe.model.sources),
        targetDayOfYearWeight: recipe.model.compositeOptions.dayOfYearPercentile / 100,
        shadowTolerance: 1 - recipe.model.compositeOptions.shadowPercentile / 100,
        hazeTolerance: 1 - recipe.model.compositeOptions.hazePercentile / 100,
        greennessWeight: recipe.model.compositeOptions.ndviPercentile / 100,
        bands: recipe.model.bands,
        panSharpening: !!recipe.model.panSharpen,
        surfaceReflectance: recipe.model.compositeOptions.corrections.includes('SR'),
        medianComposite: recipe.model.compositeOptions.compose === 'MEDIAN',
        brdfCorrect: recipe.model.compositeOptions.corrections.includes('BRDF'),
        maskClouds: recipe.model.compositeOptions.mask.includes('CLOUDS'),
        maskSnow: recipe.model.compositeOptions.mask.includes('SNOW'),
        sceneIds: sceneIds,
        type: recipe.model.sceneSelectionOptions.type === SceneSelectionType.ALL ? 'automatic' : 'manual'
    }
}

const transformRecipeForRetrieval = (recipe) => {
    const name = recipe.title || recipe.placeholder
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.mosaic.panel.retrieve.form.task', destination], {name})
    return {
        'operation': `sepal.image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`,
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
    case 'FUSION_TABLE':
        return {
            type: 'fusionTable',
            id: aoi.id,
            keyColumn: aoi.keyColumn,
            key: aoi.key
        }
    case 'POLYGON':
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

const toResponse = map((e) => e.response)
