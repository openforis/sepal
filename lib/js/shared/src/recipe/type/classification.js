import {defineRecipeType} from '../defineRecipeType.js'
import {fromList, idResults, selectionResults} from '../source/extract.js'
import {recipeReference} from '../source/reference.js'

// Classification's direct sources, from lib/js/ee/src/classification/classification.js:
//
//   model.inputImagery.images            zipped into one image in model order, so position decides band
//                                        order - the list is never deduplicated or reordered
//   model.trainingData.dataSets[RECIPE]  a bare recipe id, loaded for getTrainingData$
//
// Only a RECIPE data set is loaded at execution time. A SAMPLE_CLASSIFICATION set was sampled in the panel
// and persists its points in referenceData; its `recipeIdToSample` and `assetToSample` are provenance of
// that sampling, and emitting them would pin recipes execution never reads. `auxiliaryImagery` names
// covariates whose Earth Engine assets are fixed in the implementation, not references.

export const INPUT_IMAGE = 'INPUT_IMAGE'
export const TRAINING_DATA_SOURCE = 'TRAINING_DATA_SOURCE'

export default defineRecipeType({
    type: 'CLASSIFICATION',
    directSources: model => [
        ...fromList({
            model,
            keys: ['inputImagery', 'images'],
            role: INPUT_IMAGE,
            itemResults: (image, path) => selectionResults({selection: image, role: INPUT_IMAGE, path})
        }),
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
