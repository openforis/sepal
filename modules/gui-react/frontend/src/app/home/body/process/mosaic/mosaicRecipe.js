import actionBuilder from 'action-builder'
import {countryFusionTable} from 'app/home/map/aoiLayer'
import moment from 'moment'
import {Subject} from 'rxjs'
import {isDataSetInDateRange, isSourceInDateRange} from 'sources'
import {select} from 'store'
import Labels from '../../../map/labels'

const DATE_FORMAT = 'YYYY-MM-DD'

export const SceneSelectionType = Object.freeze({
    ALL: 'all',
    SELECT: 'select'
})

const recipePath = (recipeId, path) => {
    const recipeTabIndex = select('process.tabs')
        .findIndex((recipe) => recipe.id === recipeId)
    if (recipeTabIndex === -1)
        throw new Error(`Recipe not found: ${recipeId}`)
    if (path && Array.isArray(path))
        path = path.join('.')
    return ['process.tabs', recipeTabIndex, path]
        .filter(e => e !== undefined)
        .join('.')
}

const event$ByRecipeAndType = {}

export const RecipeEvents = (recipeId) => {
    let event$ByType = event$ByRecipeAndType[recipeId]
    if (!event$ByType) {
        event$ByType = {
            autoSelectScenes$: new Subject()
        }
        event$ByRecipeAndType[recipeId] = event$ByType
    }
    return event$ByType
}

export const RecipeState = (recipeId) => {
    const recipeTabIndex = select('process.tabs')
        .findIndex((recipe) => recipe.id === recipeId)
    if (recipeTabIndex === -1)
        return null

    const get = (path) => {
        return select(recipePath(recipeId, path))
    }
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
    const _actionBuilder = (name, props) => {
        return actionBuilder(name, props)
            .within(recipePath(id))
    }
    const set = (name, prop, value, otherProps) =>
        _actionBuilder(name, otherProps)
            .set(prop, value)
            .build()
    const setAll = (name, values, otherProps) =>
        _actionBuilder(name, otherProps)
            .setAll(values)
            .build()

    return {
        setInitialized() {
            return set('SET_INITIALIZED', 'ui.initialized', true)
        },
        setLabelsShown(shown) {
            Labels.setLayer({contextId: id, shown})
            return set('SET_LABELS_SHOWN', 'ui.labelsShown', shown, {shown})
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
            return set('SET_SCENE_Areas', 'ui.sceneAreas', sceneAreas, {sceneAreas})
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
        setAutoSelectingScenes(selecting) {
            return set('SET_AUTO_SELECTING_SCENES', 'ui.autoSelectingScenes', selecting, {selecting})
        },
        autoSelectScenes(sceneCount) {
            this.setAutoSelectingScenes(true).dispatch()
            RecipeEvents(id).autoSelectScenes$.next(sceneCount)
            return set('SET_SCENE_COUNT', 'ui.sceneCount', sceneCount, {sceneCount})
        }
    }
}

const initRecipe = (recipe) => {
    if (recipe.ui)
        return

    const actions = RecipeActions(recipe.id)
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
        targetDayPercentile: 0,
        mask: ['CLOUDS'],
        compose: 'MEDOID'
    }).dispatch()


    actions.setLabelsShown(false).dispatch()
    actions.setSceneAreasShown(true).dispatch()
    actions.setBands('red, green, blue').dispatch()
    actions.autoSelectScenes({min: 1, max: 99}).dispatch()
}

const createAoi = (aoiForm) => {
    switch (aoiForm.section) {
        case 'country':
            return {
                type: 'fusionTable',
                id: countryFusionTable,
                keyColumn: 'id',
                key: aoiForm.area || aoiForm.country,
                bounds: aoiForm.bounds
            }
        case 'fusionTable':
            return {
                type: 'fusionTable',
                id: aoiForm.fusionTable,
                keyColumn: aoiForm.fusionTableColumn,
                key: aoiForm.fusionTableRow,
                bounds: aoiForm.bounds
            }
        case 'polygon':
            return {
                type: 'polygon',
                path: aoiForm.polygon,
                bounds: aoiForm.bounds
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
    const doy = moment(date, DATE_FORMAT).dayOfYear()
    const fromDoy = moment(dates.seasonStart).dayOfYear()
    const toDoy = moment(dates.seasonEnd).dayOfYear()
    return toDoy <= fromDoy
        ? doy >= fromDoy || doy < toDoy
        : doy >= fromDoy && doy < toDoy
}

