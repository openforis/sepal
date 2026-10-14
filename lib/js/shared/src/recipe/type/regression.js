import {inputBandSetRefusals} from '../bandSets.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT, REFERENCE} from '../output/readiness.js'
import {fromList, idResults} from '../source/extract.js'
import {fromInputImagery, INPUT_IMAGE} from '../source/inputImagery.js'
import {recipeReference} from '../source/reference.js'
import {noTrainingData, trainingDataRequirement} from '../trainingData.js'

// Regression's direct sources, from lib/js/ee/src/regression/regression.js:
//
//   model.inputImagery.images            zipped into one image in model order
//   model.trainingData.dataSets[RECIPE]  a bare recipe id, loaded for getTrainingData$
//
// Only a RECIPE data set is loaded at execution time. An EE_TABLE set was already read into referenceData
// when it was created, and a SAMPLE_IMAGE set's `recipeIdToSample` and `assetToSample` record what it sampled
// - emitting either would pin a source execution never reads. `auxiliaryImagery` names covariates whose
// Earth Engine assets are fixed in the implementation.
//
// Deliberately not shared with Classification: the extraction is small and the two surround it with different
// models, so one abstraction over both would have to know which is which.
//
// Described, and refused, over its input images' band sets as Classification is (bandSets.js). Running it trains its
// classifier on its training data whatever the classifier - unlike Classification, there is no supplied tree it uses as
// given - so it needs training data (noTrainingData, trainingData.js), a requirement of its configuration
// (output/readiness.js) that leaves its band described. A RECIPE data set counts as training data: its points are
// unknown until execution reads them.

export {INPUT_IMAGE}
export const TRAINING_DATA_SOURCE = 'TRAINING_DATA_SOURCE'

// No encoding: the prediction measures whatever the training data's values measure, which the recipe does not state.
export const REGRESSION_BANDS = [
    {name: 'regression', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}
]

export default defineRecipeType({
    type: 'REGRESSION',
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
    executionNeeds: {[IMAGE_OUTPUT]: {[INPUT_IMAGE]: IMAGE_OUTPUT, [TRAINING_DATA_SOURCE]: REFERENCE}},
    configurationRequirements: [trainingDataRequirement(noTrainingData)],
    imageOutput: imageOutputProvider({
        describe: ({recipe, inputs, describedInputs}) => {
            const refusals = inputBandSetRefusals(recipe.model, describedInputs(INPUT_IMAGE))
            if (refusals.length) {
                return {diagnostics: refusals}
            }
            return inputs(INPUT_IMAGE) && {bands: REGRESSION_BANDS, evidence: []}
        }
    })
})
