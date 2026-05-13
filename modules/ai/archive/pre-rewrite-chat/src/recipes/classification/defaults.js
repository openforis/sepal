// Default classification model. Mirrors the GUI's `getDefaultModel` from
// classificationRecipe.js plus the implicit values populated by the
// classifier panel's valuesToModel fallbacks (`tileScale: 1`, `normalize:
// 'YES'`).
//
// Notable corrections vs. the GUI's `getDefaultModel`:
//   - Adds `tileScale: 1` and `normalize: 'YES'` to the classifier — the GUI
//     synthesizes these via valuesToModel when the panel is applied. Without
//     them, the SVM/MINIMUM_DISTANCE conditional-required rules would fail on
//     a freshly-created model.
//   - Adds `inputImagery: {images: []}` and `legend: {entries: []}` — required
//     by the schema; the GUI populates them via separate panels (the recipe
//     enters the `inputImagery` and `legend` panel-wizard steps before being
//     considered initialized).
//
// `inputImagery.images` and `legend.entries` are intentionally empty — there
// is no sensible default for input images or class definitions; the LLM must
// fill these in based on the user's intent. The schema's `minItems: 1`
// constraint on each enforces this.

const {randomUUID} = require('crypto')

const getDefaults = () => ({
    inputImagery: {images: []},
    legend: {entries: []},
    trainingData: {
        dataSets: [
            {
                dataSetId: randomUUID(),
                name: 'Collected',
                type: 'COLLECTED',
                referenceData: []
            }
        ]
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

        shrinkage: 0.005,
        samplingRate: 0.7,
        loss: 'LeastAbsoluteDeviation',

        lambda: 0.000001,

        decisionProcedure: 'Voting',
        svmType: 'C_SVC',
        kernelType: 'LINEAR',
        shrinking: true,
        degree: 3,
        gamma: null,
        coef0: 0,
        cost: 1,
        nu: 0.5,

        metric: 'euclidean',

        tileScale: 1,
        normalize: 'YES'
    }
})

module.exports = {getDefaults}
