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
        setInitialized(initialized) {
            return set('SET_INITIALIZED', 'ui.initialized', !!initialized, {initialized})
        }
    }
}

const initRecipe = (recipeState) => {
    if (!recipeState || recipeState.ui)
        return

    const actions = RecipeActions(recipeState.id)

    const model = recipeState.model
    if (model)
        return actions.setInitialized(model.aoi && model.period).dispatch()

    const now = moment()
    actions.setPeriod({
        model: {
            startYear: 2000,
            endYear: now.year()
        }
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
            sensors: ['L8', 'L7'],
            scale: 3000
        }
    }).subscribe()
}

