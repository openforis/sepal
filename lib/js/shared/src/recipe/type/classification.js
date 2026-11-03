import {inputBandSetRefusals, inputBandSetRequirements} from '../bandSets.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {CLASSIFIER, IMAGE_OUTPUT, TRAINING_DATA} from '../output/readiness.js'
import {fromList, idResults} from '../source/extract.js'
import {fromInputImagery, INPUT_IMAGE, inputImageryRequirement} from '../source/inputImagery.js'
import {recipeReference} from '../source/reference.js'
import {noTrainingData, TRAINING_DATA_SOURCE, trainingDataRequirement, trainingFeaturesRequirements, trainingSamplesRequirement} from '../trainingData.js'

// Classification's direct sources, from lib/js/ee/src/classification/classification.js:
//
//   model.inputImagery.images            zipped into one image in model order
//   model.trainingData.dataSets[RECIPE]  a bare recipe id, loaded for its unscaled samples (getSamples$)
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
// (missingTrainingData), holding what its classifier's training needs of them (trainingNeeds), requirements of its
// configuration (output/readiness.js) that leave its bands described. Only configurations are read for them
// (trainingData.js): its own, and those of the recipes its data sets reuse as the read holds them; one not held is not
// taken for none, nor for one lacking what is needed. Those it reuses must also supply every feature it trains on, sampled of
// their own imagery (trainingFeaturesRequirements): producing its training data for another (TRAINING_DATA) samples
// that recipe's features, so its own band sets refuse it nothing there.

export {INPUT_IMAGE}
export {TRAINING_DATA_SOURCE}

// A Classification applied to other imagery (CLASSIFIER) - each scene of a collection, as classifyImage applies its band
// sets (lib/js/ee/src/classification/classification.js) - over more than one input image: which input's band sets the
// scene is given is not established. Located at its input images, named with their `count`. Its own image, and the
// training data it supplies another recipe, are unaffected.
export const MULTIPLE_CLASSIFIER_INPUTS = 'MULTIPLE_CLASSIFIER_INPUTS'

const INPUT_IMAGERY_PATH = ['model', 'inputImagery', 'images']

const TRAINING_NEEDS = {[INPUT_IMAGE]: IMAGE_OUTPUT, [TRAINING_DATA_SOURCE]: TRAINING_DATA}

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
export const missingTrainingData = (model, context) =>
    requiresTraining(model?.classifier?.type) && noTrainingData(model, context)

// What a trained classifier's training needs of the points it trains on, beyond having some (trainingSamplesRequirement,
// trainingData.js), as Earth Engine trains it as execution builds it (lib/js/ee/src/classification) - each established by
// training it over synthetic samples, which is not an account of everything training can refuse:
//
// - Random forest, gradient tree boost, CART and naive Bayes refuse points of one class: they need two classes at least.
// - A one-class SVM trains on the points of the class it is configured with (`oneClass`) alone - class 0 where none is, as
//   Earth Engine defaults it - and refuses to train without one of them.
// - Mahalanobis minimum distance computes the inverse covariance of each class it trains on, refusing a class of one point.
//   Masking can take such a class away altogether, leaving the rest to train on, so only points no class of which has two
//   are refused here. Whether a covariance can be inverted depends on the values sampled, which are not known here.
// - Any other SVM, and Euclidean or cosine minimum distance, trains on points of one class. Whether a NU-SVC's nu is
//   feasible depends on how the samples trained on divide between classes, which masking can change.
// - A supplied decision tree is not trained, and needs nothing.
//
// None needs a point of each legend class: a class no point is of is never predicted, its probability zero.
export const trainingNeeds = model => {
    const {type, svmType, metric, oneClass} = model?.classifier || {}
    if (!requiresTraining(type)) {
        return null
    }
    if (MULTIPLE_CLASS_TYPES.includes(type)) {
        return {classes: 2}
    }
    if (type === 'SVM' && (svmType ?? 'C_SVC') === 'ONE_CLASS') {
        return {trainsOn: configuredClass(oneClass) ?? 0}
    }
    if (type === 'MINIMUM_DISTANCE' && (metric ?? 'euclidean') === 'mahalanobis') {
        return {classSamples: 2}
    }
    return {}
}

const MULTIPLE_CLASS_TYPES = ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART', 'NAIVE_BAYES']

// The class a one-class SVM is configured with, read as execution reads it.
const configuredClass = value => {
    const parsed = parseInt(typeof value === 'string' ? value : String(value ?? ''))
    return Number.isFinite(parsed) ? parsed : null
}

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
    // its input images built and its points sampled over them - never that recipe's image. Its classifier, trained to
    // be applied to other imagery (CLASSIFIER), needs what producing its training data does, and that there is
    // training data that suits it, as its image does; it is never built or described for that.
    executionNeeds: {
        [IMAGE_OUTPUT]: TRAINING_NEEDS,
        [TRAINING_DATA]: TRAINING_NEEDS,
        [CLASSIFIER]: TRAINING_NEEDS
    },
    configurationRequirements: [
        {...inputImageryRequirement, operations: [...inputImageryRequirement.operations, CLASSIFIER]},
        // Applied to other imagery, its classifier reads its own band sets of it (classifyImage); its training data,
        // reused, carries what the recipe reusing it trains on instead (trainingFeaturesRequirements).
        ...inputBandSetRequirements([CLASSIFIER]),
        {
            code: MULTIPLE_CLASSIFIER_INPUTS,
            operations: [CLASSIFIER],
            findings: model => {
                const count = model?.inputImagery?.images?.length || 0
                return count > 1 ? [{path: INPUT_IMAGERY_PATH, count}] : []
            }
        },
        // Producing its training data for another (TRAINING_DATA) needs neither: what it supplies is joined with the
        // rest of what that recipe trains on, which is judged there.
        trainingDataRequirement(missingTrainingData, [IMAGE_OUTPUT, CLASSIFIER]),
        trainingSamplesRequirement(trainingNeeds, [IMAGE_OUTPUT, CLASSIFIER]),
        ...trainingFeaturesRequirements(model => requiresTraining(model?.classifier?.type), [IMAGE_OUTPUT, CLASSIFIER])
    ],
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
