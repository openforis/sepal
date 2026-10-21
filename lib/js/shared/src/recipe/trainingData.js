import {inputBandSetRefusals, sampledFeatures} from './bandSets.js'
import {IMAGE_OUTPUT, TRAINING_DATA} from './output/readiness.js'
import {INPUT_IMAGE} from './source/inputImagery.js'

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

// A data set reusing training data that holds samples without a feature the classifier trains on: a recipe in its reuse
// that stores points samples an image lacking it. Named on the finding as `provider` and `features`.
export const MISSING_TRAINING_FEATURES = 'MISSING_TRAINING_FEATURES'

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

// The requirement that the samples a recipe trains on carry every feature its classifier is trained on, judged where
// `trains(model)` holds. Execution sets the consumer's band names as every sample's features (`band_order`, getTrainingData$),
// so a recipe storing points anywhere in a data set's reuse must sample each of them, whatever other recipes sample. One
// storing none contributes no sample and requires nothing, though the recipes it reuses still do. Located at the
// consumer's data set, once for each recipe found lacking through it, so a recipe two data sets share is found for
// each. Names only, of one input image each: what is not described, not held, refused for its band sets or not a
// producer of training data - each said where it is - and several input images establish nothing.
export const trainingFeaturesRequirement = (trains = () => true) => ({
    code: MISSING_TRAINING_FEATURES,
    operations: [IMAGE_OUTPUT],
    findings: (model, context) => trains(model) ? missingTrainingFeatures(model, context) : []
})

// The consumer's own input is asked for only where a recipe its data sets reuse stores points to compare.
const missingTrainingFeatures = (model, {describedInputs, recordsOf, declares}) => {
    const providers = recordsOf(TRAINING_DATA_SOURCE) || []
    const sampling = (model.trainingData?.dataSets || []).flatMap((dataSet, index) => {
        const provider = dataSet?.type === 'RECIPE' && providers.find(({id}) => id === dataSet.recipe)
        return provider
            ? samplingRecords(provider, {recordsOf, declares}, new Set()).map(record => ({index, record}))
            : []
    })
    const required = sampling.length ? ownFeatures(model, describedInputs(INPUT_IMAGE)) : null
    if (!required) {
        return []
    }
    const featuresOf = new Map()
    const sampled = record => {
        if (!featuresOf.has(record.id)) {
            featuresOf.set(record.id, ownFeatures(record.model, describedInputs(INPUT_IMAGE, record)))
        }
        return featuresOf.get(record.id)
    }
    return sampling.flatMap(({index, record}) => {
        const features = sampled(record)
        const missing = features ? required.filter(feature => !features.includes(feature)) : []
        return missing.length ? [{path: [...TRAINING_DATA_PATH, index], provider: record.id, features: missing}] : []
    })
}

// The recipes storing points in the reuse of `record`, itself included: those whose samples a data set reusing it holds.
const samplingRecords = (record, read, visited) => {
    if (visited.has(record.id) || !read.declares(record, TRAINING_DATA)) {
        return []
    }
    visited.add(record.id)
    return [
        ...storesPoints(record.model) ? [record] : [],
        ...(read.recordsOf(TRAINING_DATA_SOURCE, record) || []).flatMap(reused => samplingRecords(reused, read, visited))
    ]
}

// What a recipe's samples carry, where its band sets are not refused for what its input provides: refused, it is said
// there.
const ownFeatures = (model, inputs) =>
    inputBandSetRefusals(model, inputs).length ? null : sampledFeatures(model, inputs)

const storesPoints = model =>
    (model?.trainingData?.dataSets || []).some(dataSet => dataSet?.type !== 'RECIPE' && dataSet?.referenceData?.length)

const establishesNoPoints = (model, read, record) => {
    const dataSets = model?.trainingData?.dataSets || []
    if (storesPoints(model)) {
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
