import globalActionBuilder from 'action-builder'
import api from 'api'
import moment from 'moment'
import {isDataSetInDateRange, isSourceInDateRange} from 'sources'
import {msg} from 'translate'
import Labels from '../../../map/labels'
import {recipePath, RecipeState as ParentRecipeState} from '../recipe'

const DATE_FORMAT = 'YYYY-MM-DD'

export {recipePath}

export const SceneSelectionType = Object.freeze({
    ALL: 'ALL',
    SELECT: 'SELECT'
})

export const RecipeState = recipeId => {
    const recipeState = ParentRecipeState(recipeId)
    if (!recipeState)
        return null
    const get = path => recipeState(path)
    get.dateRange = () => {
        const dates = get('model.dates')
        return [moment(dates.startDate, DATE_FORMAT), moment(dates.endDate, DATE_FORMAT)]
    }
    get.isDataSetInDateRange = dataSetId => {
        const [from, to] = get.dateRange()
        return isDataSetInDateRange(dataSetId, from, to)
    }
    initRecipe(get())
    return get
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
        setPreprocessOptions({values, model}) {
            return setAll('SET_PREPROCESS_OPTIONS', {
                'ui.preprocessOptions': values,
                'model.preprocessOptions': model
            }, {values, model})
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

const initRecipe = recipeState => {
    if (!recipeState || recipeState.ui)
        return

    const actions = RecipeActions(recipeState.id)

    actions.setLabelsShown(false).dispatch()

    const model = recipeState.model
    if (model)
        return actions.setInitialized(model.aoi && model.dates && model.sources).dispatch()

    const now = moment()
    actions.setDates({
        model: {
            startDate: '2000-01-01',
            endDate: now.format(DATE_FORMAT)
        }
    }).dispatch()

    actions.setSources({
        model: {
            LANDSAT: ['LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
        }
    }).dispatch()

    actions.setPreprocessOptions({
        model: {
            corrections: ['SR', 'BRDF'],
            mask: ['SNOW']
        }
    }).dispatch()
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const task = {
        'operation': 'sepal.timeseries.download',
        'params':
            {
                title: msg(['process.timeSeries.panel.retrieve.task'], {name}),
                description: name,
                expression: toExpression(recipe.ui.retrieveOptions.indicator),
                dataSets: recipe.model.sources[Object.keys(recipe.model.sources)[0]],
                aoi: recipe.model.aoi,
                fromDate: recipe.model.dates.startDate,
                toDate: recipe.model.dates.endDate,
                maskSnow: recipe.model.preprocessOptions.mask.includes('SNOW'),
                brdfCorrect: recipe.model.preprocessOptions.corrections.includes('BRDF'),
                surfaceReflectance: recipe.model.preprocessOptions.corrections.includes('SR')
            }
    }
    return api.tasks.submit$(task).subscribe()
}

const toExpression = (indicator) => {
    switch (indicator) {
        case 'NDVI':
            return '10000 * (1 + (i.nir - i.red) / (i.nir + i.red))'
        case 'NDMI':
            return '10000 * (1 + (i.nir - i.swir1) / (i.nir + i.swir1))'
        case 'EVI':
            return '10000 * (1 + 2.5 * (i.nir - i.red) / (i.nir + 6 * i.red - 7.5 * i.blue + 1))'
        case 'EVI2':
            return '10000 * (1 + 2.5 * (i.nir - i.red) / (i.nir + 2.4 * i.red + 1))'
        default:
            throw new Error('Unexpected indicator: ' + indicator)
    }
}