// Default unsupervisedClassification model. Mirrors GUI's `getDefaultModel`.

const getDefaults = () => ({
    inputImagery: {images: []},
    sampling: {
        numberOfSamples: 10000,
        sampleScale: 10
    },
    auxiliaryImagery: [],
    clusterer: {
        type: 'KMEANS',
        numberOfClusters: 5,
        tileScale: 1,
        normalize: 'YES'
    }
})

module.exports = {getDefaults}
