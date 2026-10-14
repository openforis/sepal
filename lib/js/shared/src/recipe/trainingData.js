import {NO_TRAINING_DATA} from './output/diagnostic.js'
import {IMAGE_OUTPUT} from './output/readiness.js'

// The training data a configuration holds (model.trainingData.dataSets), as Classification and Regression execute it
// (lib/js/ee/src/classification/classification.js, lib/js/ee/src/regression/regression.js). A RECIPE data set's points
// are read from that recipe when it runs, so they are unknown here and never taken for none. Every other data set runs
// on the points it stores (referenceData), whether collected, uploaded, read from a table or sampled from an image;
// none stored is none at all. Whether the points left after masking or within the imagery's footprint suffice is not
// known from the configuration.

export const TRAINING_DATA_PATH = ['model', 'trainingData', 'dataSets']

// Whether the configuration holds no training data: no data set reads a recipe for it, and none other stores a point.
export const noTrainingData = model =>
    !(model?.trainingData?.dataSets || [])
        .some(dataSet => dataSet?.type === 'RECIPE' || dataSet?.referenceData?.length)

// The requirement that a recipe whose image is trained has something to train on, found where `missing(model)` holds
// (output/readiness.js).
export const trainingDataRequirement = missing => ({
    code: NO_TRAINING_DATA,
    operations: [IMAGE_OUTPUT],
    findings: model => missing(model) ? [{path: TRAINING_DATA_PATH}] : []
})
