import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromList, idResults} from '../source/extract.js'
import {fromInputImagery, INPUT_IMAGE} from '../source/inputImagery.js'
import {recipeReference} from '../source/reference.js'

// Classification's direct sources, from lib/js/ee/src/classification/classification.js:
//
//   model.inputImagery.images            zipped into one image in model order
//   model.trainingData.dataSets[RECIPE]  a bare recipe id, loaded for getTrainingData$
//
// Only a RECIPE data set is loaded at execution time. A SAMPLE_CLASSIFICATION set was sampled in the panel
// and persists its points in referenceData; its `recipeIdToSample` and `assetToSample` are provenance of
// that sampling, and emitting them would pin recipes execution never reads. `auxiliaryImagery` names
// covariates whose Earth Engine assets are fixed in the implementation, not references.
//
// The training-data extraction stays here rather than being shared with Regression: the two surround it with
// different models, and the extraction itself is four lines.

export {INPUT_IMAGE}
export const TRAINING_DATA_SOURCE = 'TRAINING_DATA_SOURCE'

// Which classifiers can also be asked for a regression, and for the probability of each class.
export const supportRegression = classifierType =>
    ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART'].includes(classifierType)

export const supportProbability = classifierType =>
    ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART', 'SVM', 'NAIVE_BAYES'].includes(classifierType)

// The bands execution builds, in its order: what the classifier supports, and one probability per legend entry in
// the legend's own order. Only the class is categorical. No encoding is declared for the percentages the probabilities
// are stored as. Without legend entries Earth Engine cannot build class_probability, so a probability-capable
// classifier's default output fails to run; the schema stays the same, and a request for the class alone still runs.
export const classificationBands = model => {
    const classifierType = model?.classifier?.type
    const probability = supportProbability(classifierType)
    return [
        scalar('class', 'mode'),
        ...(probability ? [scalar('class_probability', 'mean')] : []),
        ...(supportRegression(classifierType) ? [scalar('regression', 'mean')] : []),
        ...(probability ? (model?.legend?.entries || []).map(({value}) => scalar(`probability_${value}`, 'mean')) : [])
    ]
}

export default defineRecipeType({
    type: 'CLASSIFICATION',
    directSources: model => [
        ...fromInputImagery(model),
        ...fromList({
            model,
            keys: ['trainingData', 'dataSets'],
            role: TRAINING_DATA_SOURCE,
            itemResults: (dataSet, path) => dataSet?.type === 'RECIPE'
                ? idResults({
                    id: dataSet.recipe,
                    toReference: recipeReference,
                    role: TRAINING_DATA_SOURCE,
                    path,
                    required: true
                })
                : []
        })
    ],
    imageOutput: imageOutputProvider({
        describe: ({recipe}) => ({bands: classificationBands(recipe.model), evidence: []})
    })
})

function scalar(name, pyramidingPolicy) {
    return {name, dataType: {arrayDimensions: 0}, pyramidingPolicy}
}
