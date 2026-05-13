module.exports = {
    id: 'land-cover-classification',
    recipeType: 'CLASSIFICATION',
    name: 'Land Cover Classification',
    description: 'Random Forest land cover classification. Requires training data and a base image recipe.',
    tags: ['classification', 'land-cover', 'random-forest', 'supervised'],
    requiredOverrides: ['trainingData'],
    model: {
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
            seed: 1
        }
    }
}
