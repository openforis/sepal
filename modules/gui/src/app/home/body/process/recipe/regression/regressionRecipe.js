import _ from 'lodash'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'

export const getDefaultModel = () => ({
    trainingData: {
        dataSets: []
    },
    auxiliaryImagery: [],
    classifier: {
        type: 'RANDOM_FOREST',
        numberOfTrees: 25,
        variablesPerSplit: null,
        minLeafPopulation: 1,
        bagFraction: 0.5,
        maxNodes: null,
        seed: 1,
    }
})

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_CLASSIFICATION_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

export const supportRegression = classifierType =>
    ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART'].includes(classifierType)

export const supportProbability = classifierType =>
    ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART', 'SVM', 'NAIVE_BAYES'].includes(classifierType)

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        includeTimeRange: false,
        customizeImage: image => ({
            ...image,
            bands: {selection: ['regression']}
        })
    })

export const hasTrainingData = recipe => {
    return !!recipe.model.trainingData.dataSets.length
}
