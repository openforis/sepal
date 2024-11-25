import _ from 'lodash'
import moment from 'moment'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {getAllVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {publishEvent} from '~/eventPublisher'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

const DATE_FORMAT = 'YYYY-MM-DD'

export const SceneSelectionType = Object.freeze({
    ALL: 'ALL',
    SELECT: 'SELECT'
})

export const defaultModel = {
    dates: {
        type: 'YEARLY_TIME_SCAN',
        targetDate: moment().set('month', 6).set('date', 2).format(DATE_FORMAT),
        seasonStart: moment().startOf('year').format(DATE_FORMAT),
        seasonEnd: moment().add(1, 'years').startOf('year').format(DATE_FORMAT),
        yearsBefore: 0,
        yearsAfter: 0
    },
    sources: {
        cloudPercentageThreshold: 75,
        dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}
    },
    sceneSelectionOptions: {
        type: SceneSelectionType.ALL,
        targetDateWeight: 0
    },
    compositeOptions: {
        corrections: ['SR', 'BRDF'],
        brdfMultiplier: 4,
        filters: [],
        orbitOverlap: 'KEEP',
        tileOverlap: 'QUICK_REMOVE',
        includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
        sentinel2CloudProbabilityMaxCloudProbability: 65,
        sentinel2CloudScorePlusBand: 'cs_cdf',
        sentinel2CloudScorePlusMaxCloudProbability: 45,
        landsatCFMaskCloudMasking: 'MODERATE',
        landsatCFMaskCloudShadowMasking: 'MODERATE',
        landsatCFMaskCirrusMasking: 'MODERATE',
        landsatCFMaskDilatedCloud: 'REMOVE',
        sepalCloudScoreMaxCloudProbability: 30,
        cloudBuffering: 0,
        holes: 'ALLOW',
        snowMasking: 'ON',
        compose: 'MEDOID'
    },
    scenes: {}
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    const set = (name, prop, value, otherProps) =>
        actionBuilder(name, otherProps)
            .set(prop, value)
            .build()

    const setAll = (name, values, otherProps) =>
        actionBuilder(name, otherProps)
            .setAll(values)
            .build()

    return {
        setSceneAreas(sceneAreas) {
            return set('SET_SCENE_AREAS', 'ui.sceneAreas', sceneAreas, {sceneAreas})
        },
        setSceneSelection(sceneAreaId) {
            return set('SET_SCENE_SELECTION', 'ui.sceneSelection', sceneAreaId, {sceneAreaId})
        },
        setSelectedScenesInSceneArea(sceneAreaId, scenes) {
            return set('SET_SELECTED_SCENES_IN_SCENE_AREA', ['model.scenes', sceneAreaId], scenes, {
                sceneAreaId,
                scenes
            })
        },
        enableBandCalibration() {
            return actionBuilder('ENABLE_BAND_CALIBRATION')
                .pushUnique('ui.compositeOptions.corrections', 'CALIBRATE')
                .pushUnique('model.compositeOptions.corrections', 'CALIBRATE')
                .build()
        },
        useAllScenes() {
            return actionBuilder('USE_ALL_SCENES')
                .set('ui.sceneSelectionOptions.type', SceneSelectionType.ALL)
                .set('model.sceneSelectionOptions.type', SceneSelectionType.ALL)
                .build()
        },
        setSelectedScenes(scenes) {
            return set('SET_SELECTED_SCENES', 'model.scenes', scenes, {scenes})
        },
        setSceneToPreview(scene) {
            return set('SET_SCENE_TO_PREVIEW', 'ui.sceneToPreview', scene, {scene})
        },
        setAutoSelectScenesState(state) {
            return set('SET_AUTO_SELECTING_SCENES', 'ui.autoSelectScenesState', state, {state})
        },
        setAutoSelectSceneCount(sceneCount) {
            return set('SET_SCENE_COUNT', 'ui.autoSelectScenes', sceneCount, {sceneCount})
        },
        autoSelectScenes({min, max}) {
            return setAll('REQUEST_AUTO_SELECT_SCENES', {
                'ui.autoSelectScenesState': 'SUBMITTED',
                'ui.autoSelectScenes': {min, max},
            }, {min, max})
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_MOSAIC_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        }
    }
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = recipe.ui.retrieveOptions.bands
    const visualizations = getAllVisualizations(recipe)
        .filter(({bands: visBands}) => visBands.every(band => bands.includes(band)))
    const [timeStart, timeEnd] = (getRecipeType(recipe.type).getDateRange(recipe) || []).map(date => date.valueOf())
    const operation = `image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`
    const recipeProperties = {
        recipe_id: recipe.id,
        recipe_projectId: recipe.projectId,
        recipe_type: recipe.type,
        recipe_title: recipe.title || recipe.placeholder,
        ..._(recipe.model)
            .mapValues(value => JSON.stringify(value))
            .mapKeys((_value, key) => `recipe_${key}`)
            .value()
    }
    const task = {
        operation,
        params: {
            title: taskTitle,
            description: name,
            image: {
                recipe: _.omit(recipe, ['ui']),
                ...recipe.ui.retrieveOptions,
                bands: {selection: bands},
                visualizations,
                properties: {...recipeProperties, 'system:time_start': timeStart, 'system:time_end': timeEnd}
            }
        }
    }
    publishEvent('submit_task', {
        recipe_type: recipe.type,
        destination,
        data_set_type: 'OPTICAL'
    })
    return api.tasks.submit$(task).subscribe()
}

export const inDateRange = (date, dates) => {
    date = moment(date, DATE_FORMAT)
    if (date.isBefore(fromDate(dates)) || date.isSameOrAfter(toDate(dates)))
        return false
    const doy = dayOfYearIgnoringLeapDay(date)
    const fromDoy = dayOfYearIgnoringLeapDay(dates.seasonStart)
    const toDoy = dayOfYearIgnoringLeapDay(dates.seasonEnd)
    return toDoy <= fromDoy
        ? doy >= fromDoy || doy < toDoy
        : doy >= fromDoy && doy < toDoy
}

export const dateRange = dates => {
    const seasonStart = moment.utc(dates.seasonStart, DATE_FORMAT)
    const seasonEnd = moment.utc(dates.seasonEnd, DATE_FORMAT)
    return [
        seasonStart.subtract(dates.yearsBefore, 'years'),
        seasonEnd.add(dates.yearsAfter, 'years')
    ]
}

export const getSource = recipe => {
    const dataSets = selectFrom(recipe, 'model.sources.dataSets')
    return dataSets && Object.keys(dataSets)[0]
}

const fromDate = dates =>
    moment(dates.seasonStart, DATE_FORMAT).subtract(dates.yearsBefore, 'years').format(DATE_FORMAT)

const toDate = dates =>
    moment(dates.seasonEnd, DATE_FORMAT).add(dates.yearsAfter, 'years').format(DATE_FORMAT)

const dayOfYearIgnoringLeapDay = date => {
    date = moment(date)
    let doy = date.dayOfYear()
    if (date.isLeapYear() && doy > 60)
        doy = doy + 1
    return doy
}
