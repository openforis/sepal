import _ from 'lodash'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {getAllVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {publishEvent} from '~/eventPublisher'
import {msg} from '~/translate'

export const getDefaultModel = () => ({
    inputImagery: {images: []},
    bandNames: {bandNames: []}
})

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)
    return {
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_BAND_MATH_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
        syncBandNames(bandNames) {
            return actionBuilder('SYNC_BAND_NAMES', {bandNames})
                .set('model.bandNames.bandNames', bandNames)
                .dispatch()
        }
    }
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const bands = recipe.ui.retrieveOptions.bands
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const operation = `image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`
    const recipeProperties = {
        recipe_id: recipe.id,
        recipe_projectId: recipe.projectId,
        recipe_type: recipe.type,
        recipe_title: recipe.title || recipe.placeholder,
        ..._(recipe.model)
            .mapValues(value => JSON.stringify(value))
            .mapKeys((_value, key) => `recipe_${key}`)
            .value()
    }
    const task = {
        operation,
        params: {
            title: taskTitle,
            description: name,
            image: {
                ...recipe.ui.retrieveOptions,
                recipe: _.omit(recipe, ['ui']),
                bands: {selection: bands},
                visualizations: getAllVisualizations(recipe),
                properties: recipeProperties,
            }
        }
    }
    publishEvent('submit_task', {
        recipe_type: recipe.type,
        destination
    })
    return api.tasks.submit$(task).subscribe()
}

