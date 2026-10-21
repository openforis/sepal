import {IMAGE_OUTPUT, TRAINING_DATA} from './output/readiness.js'

// The training data a configuration holds (model.trainingData.dataSets), as Classification and Regression execute it
// (lib/js/ee/src/classification/classification.js, lib/js/ee/src/regression/regression.js). A RECIPE data set reuses
// the training data that recipe produces when it runs: the points its own sets store, and those of the recipes they
// reuse in turn. Every other data set runs on the points it stores (referenceData), whether collected, uploaded, read
// from a table or sampled from an image; none stored is none at all. Whether the points left after masking or within
// the imagery's footprint suffice is not known from the configuration.

// The role of the recipes a data set reuses the training data of.
export const TRAINING_DATA_SOURCE = 'TRAINING_DATA_SOURCE'

// A classifier that is trained on samples, configured with none: no data set stores a point, and every recipe one
// reuses is known to store none either, however far its own reuse goes. Says only that training data is absent; one
// stored point anywhere ends it, without establishing that training on it succeeds.
export const NO_TRAINING_DATA = 'NO_TRAINING_DATA'

export const TRAINING_DATA_PATH = ['model', 'trainingData', 'dataSets']

// Whether the configuration establishes that it holds no training data, judged from the records the read resolved
// (`recordsOf`, output/readiness.js): no data set stores a point, and each recipe a data set reuses is held, of a type
// that produces training data (`declares`), and establishes the same. A record not held, a reference that resolves to
// none, a recipe whose type produces no training data - refused as that, whatever its model holds - or one reached again
// along a cycle, which its dependencies are refused for, establishes nothing. Without the read's records, a reused recipe is never
// taken for one storing none. Each recipe is judged once in a read.
export const noTrainingData = (model, {recordsOf, declares} = {}) =>
    establishesNoPoints(model, {recordsOf, declares, judged: new Map()})

// The requirement that a recipe whose image is trained has something to train on, found where `missing(model, context)`
// holds (output/readiness.js).
export const trainingDataRequirement = missing => ({
    code: NO_TRAINING_DATA,
    operations: [IMAGE_OUTPUT],
    findings: (model, context) => missing(model, context) ? [{path: TRAINING_DATA_PATH}] : []
})

const establishesNoPoints = (model, read, record) => {
    const dataSets = model?.trainingData?.dataSets || []
    if (dataSets.some(dataSet => dataSet?.type !== 'RECIPE' && dataSet?.referenceData?.length)) {
        return false
    }
    const reused = dataSets.filter(dataSet => dataSet?.type === 'RECIPE')
    if (!reused.length) {
        return true
    }
    const providers = read.recordsOf?.(TRAINING_DATA_SOURCE, record)
    return Boolean(providers) && providers.length === reused.length && providers.every(provider => storesNone(provider, read))
}

const storesNone = (provider, read) => {
    if (!read.judged.has(provider.id)) {
        read.judged.set(provider.id, false)
        read.judged.set(provider.id, Boolean(read.declares?.(provider, TRAINING_DATA))
            && establishesNoPoints(provider.model, read, provider))
    }
    return read.judged.get(provider.id)
}
