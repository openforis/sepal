import {RecipeState as ParentRecipeState, recipePath} from '../recipe'
import {isDataSetInDateRange, isSourceInDateRange} from 'sources'
import Labels from '../../../map/labels'
import backend from 'backend'
import globalActionBuilder from 'action-builder'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export {recipePath}

export const SceneSelectionType = Object.freeze({
    ALL: 'all',
    SELECT: 'select'
})

export const RecipeState = (recipeId) => {
    const recipeState = ParentRecipeState(recipeId)
    if (!recipeState)
        return null
    const get = (path) => recipeState(path)
    get.dateRange = () => {
        const dates = get('model.dates')
        const seasonStart = moment(dates.seasonStart, DATE_FORMAT)
        const seasonEnd = moment(dates.seasonEnd, DATE_FORMAT)
        return [
            seasonStart.subtract(dates.yearsBefore, 'years'),
            seasonEnd.add(dates.yearsAfter, 'years')
        ]
    }
    get.isSourceInDateRange = (sourceId) => {
        const [from, to] = get.dateRange()
        return isSourceInDateRange(sourceId, from, to)
    }
    get.isDataSetInDateRange = (dataSetId) => {
        const [from, to] = get.dateRange()
        return isDataSetInDateRange(dataSetId, from, to)
    }

    get.source = () => {
        const sources = get('model.sources')
        return sources && Object.keys(sources)[0]
    }
    initRecipe(get())
    return get
}

export const RecipeActions = (id) => {
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
                'ui.bands.selection': bands,
                'model.bands': bands ? bands.split(',').map(band => band.trim()) : null
            }, {bands})
        },
        setPanSharpen(enabled) {
            return setAll('SET_PAN_SHARPEN', {
                'ui.bands.panSharpen': enabled,
                'model.panSharpen': enabled
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
                .sideEffect(recipe => backend.gee.retrieveMosaic(recipe))
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

const initRecipe = (recipeState) => {
    if (!recipeState || recipeState.ui)
        return

    const actions = RecipeActions(recipeState.id)

    actions.setLabelsShown(false).dispatch()
    actions.setSceneAreasShown(true).dispatch()
    actions.setBands('RED, GREEN, BLUE').dispatch()
    actions.setAutoSelectSceneCount({min: 1, max: 99}).dispatch()

    const model = recipeState.model
    if (model)
        return actions.setInitialized(model.aoi && model.dates && model.sources).dispatch()

    const now = moment()
    actions.setDates({
        model: {
            targetDate: now.format(DATE_FORMAT),
            seasonStart: now.startOf('year').format(DATE_FORMAT),
            seasonEnd: now.add(1, 'years').startOf('year').format(DATE_FORMAT),
            yearsBefore: 0,
            yearsAfter: 0
        }
    }).dispatch()

    actions.setSources({
        model: {
            LANDSAT: ['LANDSAT_8']
        }
    }).dispatch()

    actions.setSceneSelectionOptions({
        model: {
            type: SceneSelectionType.ALL,
            targetDateWeight: 0
        }
    }).dispatch()

    actions.setCompositeOptions({
        model: {
            corrections: ['SR', 'BRDF'],
            filters: [],
            mask: ['CLOUDS', 'SNOW'],
            compose: 'MEDOID'
        }
    }).dispatch()
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

const fromDate = (dates) =>
    moment(dates.seasonStart, DATE_FORMAT).subtract(dates.yearsBefore, 'years').format(DATE_FORMAT)

const toDate = (dates) =>
    moment(dates.seasonEnd, DATE_FORMAT).add(dates.yearsAfter, 'years').format(DATE_FORMAT)

const dayOfYearIgnoringLeapDay = (date) => {
    date = moment(date)
    let doy = date.dayOfYear()
    if (date.isLeapYear() && doy > 60)
        doy = doy + 1
    return doy
}
