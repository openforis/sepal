import _ from 'lodash'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {getAllVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {publishEvent} from '~/eventPublisher'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

export const getDefaultModel = () => ({
    sampling: {
        numberOfSamples: 1e4,
        sampleScale: 10,
    },
    auxiliaryImagery: [],
    clusterer: {
        type: 'KMEANS',
        numberOfClusters: 5
    }
})

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_UNSUPERVISED_CLASSIFICATION_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

export const getMaxNumberofClusters = recipe => {
    const {type, numberOfClusters, maxNumberOfClusters} = selectFrom(recipe, 'model.clusterer')
    return ['KMEANS', 'LVQ'].includes(type)
        ? numberOfClusters
        : maxNumberOfClusters
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const bands = ['class']
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const operation = `image.${destination}`
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
