import {RecipeState as GlobalRecipeState, recipePath} from '../recipe'
import api from 'api'
import globalActionBuilder from 'action-builder'
import moment from 'moment'

export {recipePath}
export const RecipeState = recipeId => {
    const recipeState = GlobalRecipeState(recipeId)
    initRecipe(recipeState())
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
        setPeriod({values, model}) {
            return setAll('SET_PERIOD', {
                'ui.period': values,
                'model.period': model,
            }, {values, model})
        },
        setTypology({values, model}) {
            return setAll('SET_TYPOLOGY', {
                'ui.typology': values,
                'model.typology': model,
            }, {values, model})
        },
        setTrainingData({values, model}) {
            return setAll('SET_TRAINING_DATA', {
                'ui.trainingData': values,
                'model.trainingData': model,
            }, {values, model})
        },
        setCompositeOptions({values, model}) {
            return setAll('SET_COMPOSITE_OPTIONS', {
                'ui.compositeOptions': values,
                'model.compositeOptions': model,
            }, {values, model})
        },
        setFusionTableColumns(columns) {
            return set('SET_FUSION_TABLE_COLUMNS', 'ui.fusionTable.columns', columns, {columns})
        },
        setPreviewType(type, value) {
            return setAll('SET_PREVIEW_TYPE', {
                'ui.preview.type': type,
                'ui.preview.value': value,
            }, {previewType: type, value})
        },
        setPreviewYear(previewYear) {
            return setAll('SET_PREVIEW_YEAR', {
                'ui.preview.year': previewYear
            }, {previewYear})
        },
        setCompositeTaskId(taskId) {
            return setAll('SET_COMPOSITE_TASK_ID', {
                'model.compositeTaskId': taskId
            }, {taskId})
        },
        setLandCoverMapTaskId(taskId) {
            return setAll('SET_LAND_COVER_MAP_TASK_ID', {
                'model.compositeTaskId': taskId
            }, {taskId})
        },
        setStatus(status) {
            return setAll('SET_STATUS', {
                'model.status': status
            }, {status})
        },
        setInitialized(initialized) {
            return set('SET_INITIALIZED', 'ui.initialized', !!initialized, {initialized})
        },
        selectPanel(name) {
            return set('SELECT_PANEL', 'ui.selectedPanel', name, {name})
        }

    }
}

const initRecipe = recipe => {
    if (!recipe || recipe.ui)
        return

    const actions = RecipeActions(recipe.id)

    const model = recipe.model
    if (model)
        return actions.setInitialized(model.aoi && model.period && model.typology).dispatch()

    const now = moment()
    let endYear = now.year()
    actions.setPeriod({
        model: {
            startYear: 2000,
            endYear: endYear
        }
    }).dispatch()

    actions.setTypology({
        model:
            { // TODO: Create a panel for collecting this data
                primitiveTypes: [
                    {id: 'otherland', label: 'Other land'},
                    {id: 'settlement', label: 'Settlement'},
                    {id: 'forest', label: 'Forest'},
                    {id: 'grassland', label: 'Grassland'},
                    {id: 'cropland', label: 'Cropland'},
                    {id: 'wetland', label: 'Wetland'}
                ]
            }
    }).dispatch()

    actions.setTrainingData({
        model: {}
    }).dispatch()

    actions.setCompositeOptions({
        model: {}
    }).dispatch()

    actions.setStatus('UNINITIALIZED').dispatch()
}

export const createComposites = recipe =>
    api.tasks.submit$({
        operation: 'sepal.landcover.create_composites',
        params: {
            assetPath: recipe.title || recipe.placeholder,
            startYear: recipe.model.period.startYear,
            endYear: recipe.model.period.endYear,
            aoi: recipe.model.aoi,
            sensors: ['L8', 'L7'], // TODO: Make sensors configurable
            scale: 30
        }
    }).subscribe(task => RecipeActions(recipe.id).setCompositeTaskId(task.id).dispatch())

export const createLandCoverMap = recipe =>
    api.tasks.submit$({
        operation: 'sepal.landcover.create_land_cover_map',
        params: {
            assetPath: recipe.title || recipe.placeholder,
            primitiveTypes: recipe.model.typology.primitiveTypes,
            startYear: recipe.model.period.startYear,
            endYear: recipe.model.period.endYear,
            aoi: recipe.model.aoi,
            trainingData: recipe.model.trainingData,
            scale: 30,
        }
    }).subscribe(task => RecipeActions(recipe.id).setLandCoverMapTaskId(task.id).dispatch())

export const statuses = {
    UNINITIALIZED: 'UNINITIALIZED',
    COMPOSITES_PENDING_CREATION: 'COMPOSITES_PENDING_CREATION',
    CREATING_COMPOSITES: 'CREATING_COMPOSITES',
    COMPOSITES_CREATED: 'COMPOSITES_CREATED',
}