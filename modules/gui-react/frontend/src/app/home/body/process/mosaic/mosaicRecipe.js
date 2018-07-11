import globalActionBuilder from 'action-builder'
import {countryFusionTable} from 'app/home/map/aoiLayer'
import backend from 'backend'
import moment from 'moment'
import {isDataSetInDateRange, isSourceInDateRange} from 'sources'
import Labels from '../../../map/labels'
import {recipePath, RecipeState as ParentRecipeState} from '../recipe'

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
        const dates = get('dates')
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
        setInitialized() {
            return set('SET_INITIALIZED', 'ui.initialized', true)
        },
        setLabelsShown(shown) {
            return Labels.showLabelsAction({shown, mapContext: id, statePath: recipePath(id, 'ui'), layerIndex: 1})
        },
        setSceneAreasShown(shown) {
            return set('SET_SCENE_AREAS_SHOWN', 'ui.sceneAreasShown', shown, {shown})
        },
        selectPanel(panel) {
            return set('SELECT_MOSAIC_PANEL', 'ui.selectedPanel', panel, {panel})
        },
        setAoi(aoiForm) {
            return setAll('SET_AOI', {
                'ui.aoi': {...aoiForm},
                'aoi': createAoi(aoiForm),
            }, {aoiForm})
        },
        setDates(datesForm) {
            return setAll('SET_DATES', {
                'ui.dates': {...datesForm},
                'dates': createDates(datesForm)
            }, {datesForm})
        },
        setSources(sourcesForm) {
            return setAll('SET_SOURCES', {
                'ui.sources': {...sourcesForm},
                'sources': createSources(sourcesForm)
            }, {sourcesForm})
        },
        setSceneSelectionOptions(sceneSelectionOptionsForm) {
            return setAll('SET_SCENE_SELECTION_OPTIONS', {
                'ui.sceneSelectionOptions': {...sceneSelectionOptionsForm},
                'sceneSelectionOptions': createSceneSelectionOptions(sceneSelectionOptionsForm)
            }, {sceneSelectionOptionsForm})
        },
        setCompositeOptions(compositeOptionsForm) {
            return setAll('SET_COMPOSITE_OPTIONS', {
                'ui.compositeOptions': {...compositeOptionsForm},
                'compositeOptions': createCompositeOptions(compositeOptionsForm)
            }, {compositeOptionsForm})
        },
        setBands(bands) {
            return setAll('SET_BANDS', {
                'ui.bands': bands,
                'bands': bands ? bands.split(',').map(band => band.trim()) : null
            }, {bands})
        },
        setPanSharpen(enabled) {
            return setAll('SET_PAN_SHARPEN', {
                'ui.panSharpen': enabled,
                'panSharpen': enabled
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
            return set('SET_SELECTED_SCENES_IN_SCENE_AREA', ['scenes', sceneAreaId], scenes, {sceneAreaId, scenes})
        },
        setSelectedScenes(scenes) {
            return set('SET_SELECTED_SCENES', 'scenes', scenes, {scenes})
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
    }
}

const initRecipe = (recipeState) => {
    if (!recipeState || recipeState.ui || recipeState.aoi)
        return

    const actions = RecipeActions(recipeState.id)
    actions.setDates({
        advanced: false,
        targetYear: String(moment().year()),
        targetDate: moment().format(DATE_FORMAT),
        seasonStart: moment().startOf('year').format(DATE_FORMAT),
        seasonEnd: moment().add(1, 'years').startOf('year').format(DATE_FORMAT),
        yearsBefore: 0,
        yearsAfter: 0
    }).dispatch()

    actions.setSources({
        source: 'landsat'
    }).dispatch()

    actions.setSceneSelectionOptions({
        type: SceneSelectionType.ALL,
        // type: SceneSelectionType.SELECT,
        targetDateWeight: 0.5
    }).dispatch()

    actions.setCompositeOptions({
        corrections: ['SR', 'BRDF'],
        shadowPercentile: 0,
        hazePercentile: 0,
        ndviPercentile: 0,
        dayOfYearPercentile: 0,
        mask: ['CLOUDS'],
        compose: 'MEDOID'
    }).dispatch()


    actions.setLabelsShown(false).dispatch()
    actions.setSceneAreasShown(true).dispatch()
    actions.setBands('red, green, blue').dispatch()
    actions.setAutoSelectSceneCount({min: 1, max: 99}).dispatch()
}

const createAoi = (aoiForm) => {
    switch (aoiForm.section) {
        case 'country':
            return {
                type: 'fusionTable',
                id: countryFusionTable,
                keyColumn: 'id',
                key: aoiForm.area || aoiForm.country,
            }
        case 'fusionTable':
            return {
                type: 'fusionTable',
                id: aoiForm.fusionTable,
                keyColumn: aoiForm.fusionTableColumn,
                key: aoiForm.fusionTableRow,
            }
        case 'polygon':
            return {
                type: 'polygon',
                path: aoiForm.polygon,
            }
        default:
            throw new Error('InvalidsetSelectedScenes aoi section: ' + aoiForm.section)
    }
}

const createDates = (datesForm) => {
    const DATE_FORMAT = 'YYYY-MM-DD'
    if (datesForm.advanced)
        return {
            targetDate: datesForm.targetDate,
            seasonStart: datesForm.seasonStart,
            seasonEnd: datesForm.seasonEnd,
            yearsBefore: Number(datesForm.yearsBefore),
            yearsAfter: Number(datesForm.yearsAfter)
        }
    else
        return {
            targetDate: moment().year(datesForm.targetYear).month(6).date(2).format(DATE_FORMAT),
            seasonStart: moment().year(datesForm.targetYear).startOf('year').format(DATE_FORMAT),
            seasonEnd: moment().year(Number(datesForm.targetYear) + 1).startOf('year').format(DATE_FORMAT),
            yearsBefore: 0,
            yearsAfter: 0
        }
}

const createSources = (sourcesForm) => ({
    [sourcesForm.source]: sourcesForm.dataSets ? [...sourcesForm.dataSets] : null
})

const createSceneSelectionOptions = (sceneSelectionOptionsForm) => ({
    ...sceneSelectionOptionsForm
})

const createCompositeOptions = (compositeOptionsForm) => ({
    ...compositeOptionsForm
})

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