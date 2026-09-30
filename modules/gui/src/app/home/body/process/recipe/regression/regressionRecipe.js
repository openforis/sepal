import _ from 'lodash'

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

export const retrieveTask = {
    includeTimeRange: false
}

export const hasTrainingData = recipe => {
    return !!recipe.model.trainingData.dataSets.length
}
