import {inputBandSetRefusals, inputBandSetRequirements} from '../bandSets.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT, TRAINING_DATA} from '../output/readiness.js'
import {fromList, idResults} from '../source/extract.js'
import {fromInputImagery, INPUT_IMAGE, inputImageryRequirement} from '../source/inputImagery.js'
import {recipeReference} from '../source/reference.js'
import {noTrainingData, trainingDataRequirement} from '../trainingData.js'

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
//
// Its bands are its classifier's, but it is described only once its input images are, and refused where one of their
// band sets selects what its image's current description does not provide (bandSets.js) - wherever that is
// established, whatever another input still awaits. Running it needs training data where its classifier is trained
// (missingTrainingData), a requirement of its configuration (output/readiness.js) that leaves its bands described. Only
// the configuration is read for that (trainingData.js): a RECIPE data set's points are unknown until execution reads
// them, and are not taken for none.

export {INPUT_IMAGE}
export const TRAINING_DATA_SOURCE = 'TRAINING_DATA_SOURCE'

// Which configured classifiers can also be asked for a regression (REGRESSION), and for the probability of each class
// (MULTIPROBABILITY, from which class_probability is derived too), as Earth Engine's table of output modes says
// (https://developers.google.com/earth-engine/guides/classification, "Classifier output modes"). A classifier is its
// configuration, `model.classifier`; a type alone, as some callers still pass, is that type with its defaults.
//
// - An SVM's support depends on its type: C_SVC and NU_SVC give MULTIPROBABILITY, ONE_CLASS gives only CLASSIFICATION,
//   and none of them REGRESSION. Earth Engine's own default type, C_SVC, is assumed where none is configured.
// - A minimum distance classifier's REGRESSION is the distance to the nearest class centre, not a regression of the
//   classes, so it is not offered as one.
// - A supplied decision tree is not in Earth Engine's table; only its class is offered.
// - PROBABILITY - the confidence in the predicted class - is no substitute for MULTIPROBABILITY, and is not used.
export const supportRegression = classifier =>
    REGRESSION_TYPES.includes(classifierOf(classifier).type)

export const supportProbability = classifier => {
    const {type, svmType = 'C_SVC'} = classifierOf(classifier)
    return type === 'SVM'
        ? MULTIPROBABILITY_SVM_TYPES.includes(svmType)
        : MULTIPROBABILITY_TYPES.includes(type)
}

const REGRESSION_TYPES = ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART']
const MULTIPROBABILITY_TYPES = ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART', 'NAIVE_BAYES']
const MULTIPROBABILITY_SVM_TYPES = ['C_SVC', 'NU_SVC']

const classifierOf = classifier =>
    typeof classifier === 'string' ? {type: classifier} : classifier || {}

// Whether a classifier is trained on samples: a supplied decision tree is used as given.
export const requiresTraining = classifierType => classifierType !== 'DECISION_TREE'

// Whether a classifier that is trained has nothing to train on.
export const missingTrainingData = model =>
    requiresTraining(model?.classifier?.type) && noTrainingData(model)

// The bands execution builds, in its order: what the classifier supports, and one probability per legend entry in
// the legend's own order. Only the class is categorical. No encoding is declared for the percentages the probabilities
// are stored as. Without legend entries Earth Engine cannot build class_probability, so a probability-capable
// classifier's default output fails to run; the schema stays the same, and a request for the class alone still runs.
export const classificationBands = model => {
    const classifier = model?.classifier
    const probability = supportProbability(classifier)
    return [
        scalar('class', 'mode'),
        ...(probability ? [scalar('class_probability', 'mean')] : []),
        ...(supportRegression(classifier) ? [scalar('regression', 'mean')] : []),
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
    // Its image trains on its training data, which reusing another recipe's runs that recipe's own production of it -
    // its input images built and its points sampled over them - never that recipe's image.
    executionNeeds: {
        [IMAGE_OUTPUT]: {[INPUT_IMAGE]: IMAGE_OUTPUT, [TRAINING_DATA_SOURCE]: TRAINING_DATA},
        [TRAINING_DATA]: {[INPUT_IMAGE]: IMAGE_OUTPUT, [TRAINING_DATA_SOURCE]: TRAINING_DATA}
    },
    configurationRequirements: [inputImageryRequirement, ...inputBandSetRequirements([TRAINING_DATA]), trainingDataRequirement(missingTrainingData)],
    imageOutput: imageOutputProvider({
        describe: ({recipe, inputs, describedInputs}) => {
            const refusals = inputBandSetRefusals(recipe.model, describedInputs(INPUT_IMAGE))
            if (refusals.length) {
                return {diagnostics: refusals}
            }
            return inputs(INPUT_IMAGE) && {bands: classificationBands(recipe.model), evidence: []}
        }
    })
})

function scalar(name, pyramidingPolicy) {
    return {name, dataType: {arrayDimensions: 0}, pyramidingPolicy}
}
