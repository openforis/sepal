import globalActionBuilder from 'action-builder'
import {recipePath, RecipeState as GlobalRecipeState} from '../recipe'
import moment from 'moment'
import api from '../../../../../backend'

export {recipePath}
export const RecipeState = (recipeId) => {
    const recipeState = GlobalRecipeState(recipeId)
    initRecipe(recipeState())
    return recipeState
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
        setPeriod({values, model}) {
            return setAll('SET_PERIOD', {
                'ui.period': values,
                'model.period': model,
            }, {values, model})
        },
        setTopology({values, model}) {
            return setAll('SET_TOPOLOGY', {
                'ui.topology': values,
                'model.topology': model,
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
        setInitialized(initialized) {
            return set('SET_INITIALIZED', 'ui.initialized', !!initialized, {initialized})
        }
    }
}

const initRecipe = (recipe) => {
    if (!recipe || recipe.ui)
        return

    const actions = RecipeActions(recipe.id)

    const model = recipe.model
    if (model)
        return actions.setInitialized(model.aoi && model.period && model.topology).dispatch()

    const now = moment()
    let endYear = now.year()
    actions.setPeriod({
        model: {
            startYear: 2000,
            endYear: endYear
        }
    }).dispatch()

    actions.setTopology({
        model:
            { // TODO: Create a panel for collecting this data
                primitiveTypes: ['primitiveA', 'primitiveB']
            }
    }).dispatch()

    actions.setTrainingData({
        model: {
            [endYear]: { // TODO: Create a panel for collecting this data
                type: 'fusionTable',
                tableId: '1kprIURiogZxAKo2Dmvnt5RVEiN0FuuPNUR4Z4COD',
                classColumn: 'class',
                classByPrimitive: {
                    'primitiveA': 1,
                    'primitiveB': 2,
                }
            }
        }
    }).dispatch()

    actions.setCompositeOptions({
        model: {}
    }).dispatch()
}

export const createComposites = (recipe) => {
    api.tasks.submit$({
        operation: 'sepal.landcover.create_composites',
        params: {
            assetPath: recipe.title || recipe.placeholder,
            startYear: recipe.model.period.startYear,
            endYear: recipe.model.period.endYear,
            aoi: recipe.model.aoi,
            sensors: ['L8', 'L7'], // TODO: Make sensors configurable
            scale: 3000
        }
    }).subscribe()
}

export const createLandCoverMap = (recipe) => {
    api.tasks.submit$({
        operation: 'sepal.landcover.create_land_cover_map',
        params: {
            assetPath: recipe.title || recipe.placeholder,
            primitiveTypes: recipe.model.topology.primitiveTypes,
            startYear: recipe.model.period.startYear,
            endYear: recipe.model.period.endYear,
            trainingDataByYear: recipe.model.trainingData,
            scale: 3000
        }
    }).subscribe()
}
