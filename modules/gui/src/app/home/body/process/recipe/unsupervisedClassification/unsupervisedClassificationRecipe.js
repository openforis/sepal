import _ from 'lodash'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'
import {selectFrom} from '~/stateUtils'

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

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        includeTimeRange: false,
        customizeImage: image => ({
            ...image,
            bands: {selection: ['class']}
        })
    })
