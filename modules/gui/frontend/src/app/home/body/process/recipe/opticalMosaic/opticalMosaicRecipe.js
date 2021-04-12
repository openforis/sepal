import {msg} from 'translate'
import {recipeActionBuilder} from '../../recipe'
import {selectFrom} from 'stateUtils'
import _ from 'lodash'
import api from 'api'
import guid from 'guid'
import moment from 'moment'

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
    sources: {LANDSAT: ['LANDSAT_8']},
    sceneSelectionOptions: {
        type: SceneSelectionType.ALL,
        targetDateWeight: 0
    },
    compositeOptions: {
        corrections: ['SR', 'BRDF'],
        filters: [],
        cloudMasking: 'MODERATE',
        cloudBuffering: 0,
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

        // image layer source: {id: asdf, type: recipe, recipeId: recipeId}
        // feature layer sources: [{id: qwer, type: aoi}, {id: zxcv, type: sceneAreas}]
        // set layout: {center: {sourceId: asdf}}
        initializeLayers() {
            const recipeImageLayerSource = {
                id: guid(),
                type: 'Recipe',
                sourceConfig: {
                    recipeId: id
                }
            }
            const planetImageLayerSource = {
                id: guid(),
                type: 'Planet',
                sourceConfig: {}
            }
            const googleSatelliteImageLayerSource = {
                id: guid(),
                type: 'GoogleSatellite',
                sourceConfig: {}
            }
            const imageLayerSources = [
                recipeImageLayerSource,
                planetImageLayerSource,
                googleSatelliteImageLayerSource
            ]
            const layers = {
                // 'center': {
                //     imageLayer,
                //     featureLayers: [
                //         {type: 'Aoi'}
                //     ]
                // }
                'top-right': {
                    imageLayer: {
                        sourceId: planetImageLayerSource.id,
                        layerConfig: {
                            dateRange: '2019-12_2020-05',
                            proc: 'rgb'
                        }
                    },
                    featureLayers: [
                        {type: 'Aoi'},
                        // {type: 'Labels'}
                    ]
                },
                'left': {
                    imageLayer: {
                        sourceId: googleSatelliteImageLayerSource.id
                    },
                    featureLayers: [
                        {type: 'Aoi'},
                        // {type: 'Labels'}
                    ]
                },
                'bottom-right': {
                    imageLayer: {
                        sourceId: recipeImageLayerSource.id,
                        layerConfig: {
                            bands: {
                                selection: ['red', 'green', 'blue'] // TODO: Fix...
                            }
                        }
                    },
                    featureLayers: [
                        {type: 'Aoi'},
                        // {type: 'Labels'}
                    ]
                }
            }
            setAll('INITIALIZE_LAYER_SOURCES',
                {
                    'ui.imageLayerSources': imageLayerSources,
                    layers,
                },
                {imageLayerSources}
            ).dispatch()
        },
        setSceneAreasShown(shown) {
            return set('SET_SCENE_AREAS_SHOWN', 'ui.sceneAreasShown', shown, {shown})
        },
        setBands(bands) {
            // this is also available in mosaicRecipe
            return setAll('SET_BANDS', {
                'ui.bands.selection': bands
            }, {bands})
        },
        setPanSharpen(enabled) {
            return setAll('SET_PAN_SHARPEN', {
                'ui.bands.panSharpen': enabled
            }, {enabled})
        },
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
    const scale = recipe.ui.retrieveOptions.scale
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = recipe.ui.retrieveOptions.bands
    const task = {
        'operation': `image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`,
        'params':
            {
                title: taskTitle,
                description: name,
                image: {
                    recipe: _.omit(recipe, ['ui']),
                    bands: {selection: bands},
                    scale
                }
            }
    }
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
    const seasonStart = moment(dates.seasonStart, DATE_FORMAT)
    const seasonEnd = moment(dates.seasonEnd, DATE_FORMAT)
    return [
        seasonStart.subtract(dates.yearsBefore, 'years'),
        seasonEnd.add(dates.yearsAfter, 'years')
    ]
}

export const getSource = recipe => {
    const sources = selectFrom(recipe, 'model.sources')
    return sources && Object.keys(sources)[0]
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
