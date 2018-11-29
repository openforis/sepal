import {RecipeState as ParentRecipeState, recipePath} from '../recipe'
import {msg} from 'translate'
import _ from 'lodash'
import api from 'api'
import globalActionBuilder from 'action-builder'

export {recipePath}

export const RecipeState = recipeId => {
    const recipeState = ParentRecipeState(recipeId)
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
        setSource({values, model, number}) {
            return setAll('SET_SOURCE', {
                ['ui.source' + number]: values,
                ['model.source' + number]: model,
            }, {values, model})
        },
        setTrainingData({values, model}) {
            return setAll('SET_TRAINING_DATA', {
                'ui.trainingData': values,
                'model.trainingData': model,
            }, {values, model})
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_ChangeDetection_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .build()
        },
        setFusionTableColumns(columns) {
            return set('SET_FUSION_TABLE_COLUMNS', 'ui.fusionTable.columns', columns, {columns})
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
    const model = recipeState.model
    if (model)
        return actions.setInitialized(
            model.source1 && model.source2
            && model.trainingData && model.trainingData.fusionTableColumn
        ).dispatch()
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
