import {defineRecipeType} from '../defineRecipeType.js'
import {fromList, idResults} from '../source/extract.js'
import {fromInputImagery, INPUT_IMAGE} from '../source/inputImagery.js'
import {recipeReference} from '../source/reference.js'

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

export {INPUT_IMAGE}
export const TRAINING_DATA_SOURCE = 'TRAINING_DATA_SOURCE'

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
    ]
})
