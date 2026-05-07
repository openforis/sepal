// Default regression model. Mirrors GUI getDefaultModel.

const getDefaults = () => ({
    inputImagery: {images: []},
    trainingData: {dataSets: []},
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
})

module.exports = {getDefaults}
