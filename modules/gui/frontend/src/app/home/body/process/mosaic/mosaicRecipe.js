import globalActionBuilder from 'action-builder'
import api from 'api'
import {selectFrom} from 'collections'
import _ from 'lodash'
import moment from 'moment'
import {isDataSetInDateRange, isSourceInDateRange} from 'sources'
import {msg} from 'translate'
import Labels from '../../../map/labels'
import {recipePath} from '../recipe'

const DATE_FORMAT = 'YYYY-MM-DD'

export const SceneSelectionType = Object.freeze({
    ALL: 'ALL',
    SELECT: 'SELECT'
})

export const defaultModel = {
    dates: {
        targetDate: moment().format(DATE_FORMAT),
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
        mask: ['CLOUDS', 'SNOW'],
        compose: 'MEDOID'
    }
}

export const RecipeState = recipe => {
    const recipeState = (path) => selectFrom(recipe, path)
    recipeState.dateRange = () => {
        const dates = recipeState('model.dates')
        const seasonStart = moment(dates.seasonStart, DATE_FORMAT)
        const seasonEnd = moment(dates.seasonEnd, DATE_FORMAT)
        return [
            seasonStart.subtract(dates.yearsBefore, 'years'),
            seasonEnd.add(dates.yearsAfter, 'years')
        ]
    }
    recipeState.isSourceInDateRange = sourceId => {
        const [from, to] = recipeState.dateRange()
        return isSourceInDateRange(sourceId, from, to)
    }
    recipeState.isDataSetInDateRange = dataSetId => {
        const [from, to] = recipeState.dateRange()
        return isDataSetInDateRange(dataSetId, from, to)
    }

    recipeState.source = () => {
        const sources = recipeState('model.sources')
        return sources && Object.keys(sources)[0]
    }
    // initRecipe(recipeState())
    return recipeState
}

export const RecipeActions = id => {
    const actionBuilder = (name, props) => {
        return globalActionBuilder(name, props)
            .within(recipePath(id))
    }
    const set = (name, prop, value, otherProps) =>
        actionBuilder(name, otherProps)
            .set(prop, value)
            .build()
    const setAll = (name, values, otherProps) =>
        actionBuilder(name, otherProps)
            .setAll(values)
            .build()

    return {
        setLabelsShown(shown) {
            return Labels.showLabelsAction({shown, mapContext: id, statePath: recipePath(id, 'ui'), layerIndex: 1})
        },
        setSceneAreasShown(shown) {
            return set('SET_SCENE_AREAS_SHOWN', 'ui.sceneAreasShown', shown, {shown})
        },
        selectPanel(panel) {
            return set('SELECT_MOSAIC_PANEL', 'ui.selectedPanel', panel, {panel})
        },
        setAoi({values, model}) {
            return setAll('SET_AOI', {
                'ui.aoi': values,
                'model.aoi': model,
            }, {values, model})
        },
        setDates({values, model}) {
            return setAll('SET_DATES', {
                'ui.dates': values,
                'model.dates': model
            }, {values, model})
        },
        setSources({values, model}) {
            return setAll('SET_SOURCES', {
                'ui.sources': values,
                'model.sources': model
            }, {values, model})
        },
        setSceneSelectionOptions({values, model}) {
            return setAll('SET_SCENE_SELECTION_OPTIONS', {
                'ui.sceneSelectionOptions': values,
                'model.sceneSelectionOptions': model
            }, {values, model})
        },
        setCompositeOptions({values, model}) {
            return setAll('SET_COMPOSITE_OPTIONS', {
                'ui.compositeOptions': values,
                'model.compositeOptions': model
            }, {values, model})
        },
        setBands(bands) {
            return setAll('SET_BANDS', {
                'ui.bands.selection': bands
            }, {bands})
        },
        setPanSharpen(enabled) {
            return setAll('SET_PAN_SHARPEN', {
                'ui.bands.panSharpen': enabled
            }, {enabled})
        },
        setModal(enabled) {
            return set('SET_MODAL', 'ui.modal', enabled, {enabled})
        },
        setBounds(bounds) {
            return set('SET_BOUNDS', 'ui.bounds', bounds, {bounds})
        },
        setFusionTableColumns(columns) {
            return set('SET_FUSION_TABLE_COLUMNS', 'ui.fusionTable.columns', columns, {columns})
        },
        setFusionTableRows(rows) {
            return set('SET_FUSION_TABLE_ROWS', 'ui.fusionTable.rows', rows, {rows})
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
            return set('SET_SCENE_COUNT', 'ui.sceneCount', sceneCount, {sceneCount})
        },
        autoSelectScenes(sceneCount) {
            return setAll('REQUEST_AUTO_SELECT_SCENES', {
                'ui.autoSelectScenesState': 'SUBMITTED',
                'ui.sceneCount': sceneCount,
            }, {sceneCount})
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_MOSAIC_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .build()
        },
        setRetrieveState(state) {
            return set('SET_RETRIEVE_STATE', 'ui.retrieveState', state, {state})
        },
        setInitialized(initialized) {
            return set('SET_INITIALIZED', 'ui.initialized', !!initialized, {initialized})
        }
    }
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.mosaic.panel.retrieve.form.task', destination], {name})
    const bands = recipe.ui.retrieveOptions.bands
    const task = {
        'operation': `sepal.image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`,
        'params':
            {
                title: taskTitle,
                description: name,
                image: {recipe: _.omit(recipe, ['ui']), bands: {selection: bands}}
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
