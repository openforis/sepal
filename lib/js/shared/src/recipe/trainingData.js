import {CALCULATED_FEATURE, COMBINED_FEATURE, featureSupply, inputBandSetRefusals, requestedFeatures, requiredBands} from './bandSets.js'
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
// that stores points has no input image supplying it, in the form the classifier's recipe builds it (featureSupply,
// bandSets.js). Named on the finding as `provider` and `features`, with `requires` naming the bands each derived one -
// a calculated index, a band combination - is built of: {[feature]: [band]}.
export const MISSING_TRAINING_FEATURES = 'MISSING_TRAINING_FEATURES'

// A feature the classifier trains on that more than one band supplies, so which one a reused sample carries is not
// established: at a data set reusing training data, a recipe in its reuse storing points two of whose inputs supply it,
// or one input more than one band matching it whatever their case (`provider`, `features`, and `conflicts`, [{feature,
// inputs: [{imageIndex, bands}]}], each input's matching bands as it spells them); at the recipe's own input images,
// where they give one name more than once, whatever its case, or combine two bands differing only in case, while it
// reuses training data (`features`, as that input spells them). Execution takes none of them, never the first.
export const AMBIGUOUS_TRAINING_FEATURES = 'AMBIGUOUS_TRAINING_FEATURES'

// Whether the configuration establishes that it holds no training data, judged from the records the read resolved
// (`recordsOf`, output/readiness.js): no data set stores a point, and each recipe a data set reuses is held, of a type
// that produces training data (`declares`), and establishes the same. A record not held, a reference that resolves to
// none, a recipe whose type produces no training data - refused as that, whatever its model holds - or one reached again
// along a cycle, which its dependencies are refused for, establishes nothing. Without the read's records, a reused recipe is never
// taken for one storing none. Each recipe is judged once in a read.
export const noTrainingData = (model, {recordsOf, declares} = {}) =>
    establishesNoPoints(model, {recordsOf, declares, judged: new Map()})

// The requirement that a recipe whose classifier is trained - for its image, or by default only there, as `operations`
// say - has something to train on, found where `missing(model, context)` holds (output/readiness.js).
export const trainingDataRequirement = (missing, operations = [IMAGE_OUTPUT]) => ({
    code: NO_TRAINING_DATA,
    operations,
    findings: (model, context) => missing(model, context) ? [{path: TRAINING_DATA_PATH}] : []
})

// The requirements that the samples a recipe trains on carry every feature its classifier is trained on, judged where
// `trains(model)` holds. The recipe defines them (requestedFeatures, bandSets.js) and every recipe storing points
// anywhere in a data set's reuse samples them over its own input images at its own points, each from the one input
// supplying it in the recipe's form (featureSupply), whatever that recipe's own band sets select or how many inputs it
// has, in what order (lib/js/ee/src/classification/features.js). One storing none contributes no sample and is not
// judged, though the recipes it reuses still are; nor is a recipe one is given as input imagery, which trains on its own
// definition. Located at the data set reusing it, once for each recipe found through it, so a recipe two data sets share
// is found for each - MISSING_TRAINING_FEATURES, AMBIGUOUS_TRAINING_FEATURES - and, where the recipe's own inputs give
// one name, at those inputs (AMBIGUOUS_TRAINING_FEATURES). An input not described, of either recipe, establishes none of
// what it might supply: no feature is missing while an input is unknown, though two known suppliers are ambiguous; what
// is not held, refused for the recipe's own band sets or not a producer of training data is said where it is.
export const trainingFeaturesRequirements = (trains = () => true, operations = [IMAGE_OUTPUT]) => [
    {
        code: MISSING_TRAINING_FEATURES,
        operations,
        findings: (model, context) => trains(model) ? trainingFeatureFindings(model, context).missing : []
    },
    {
        code: AMBIGUOUS_TRAINING_FEATURES,
        operations,
        findings: (model, context) => trains(model) ? trainingFeatureFindings(model, context).ambiguous : []
    }
]

// The recipe's own inputs are asked for only where a recipe its data sets reuse stores points to sample.
const trainingFeatureFindings = (model, {describedInputs, recordsOf, declares}) => {
    const providers = recordsOf(TRAINING_DATA_SOURCE) || []
    const sampling = (model.trainingData?.dataSets || []).flatMap((dataSet, index) => {
        const provider = dataSet?.type === 'RECIPE' && providers.find(({id}) => id === dataSet.recipe)
        return provider
            ? samplingRecords(provider, {recordsOf, declares}, new Set()).map(record => ({index, record}))
            : []
    })
    const inputs = sampling.length ? describedInputs(INPUT_IMAGE) : null
    if (!inputs || inputBandSetRefusals(model, inputs).length) {
        return NO_FINDINGS
    }
    const requested = requestedFeatures(model, inputs)
    const supplyOf = new Map()
    const supply = record => {
        if (!supplyOf.has(record.id)) {
            supplyOf.set(record.id, featureSupply(requested, record.model, describedInputs(INPUT_IMAGE, record)))
        }
        return supplyOf.get(record.id)
    }
    const located = (index, record, supplied, details) => supplied.length
        ? [{path: [...TRAINING_DATA_PATH, index], provider: record.id, features: supplied.map(({feature: {name}}) => name), ...details(supplied)}]
        : []
    return {
        missing: sampling.flatMap(({index, record}) => located(
            index,
            record,
            supply(record).filter(({suppliers, colliding, unknown}) => !suppliers.length && !colliding.length && !unknown),
            supplied => ({requires: derivedOf(supplied)})
        )),
        ambiguous: [
            ...ownAmbiguity(requested),
            ...sampling.flatMap(({index, record}) => located(
                index,
                record,
                supply(record).filter(({suppliers, colliding}) => colliding.length || suppliers.length > 1),
                supplied => ({conflicts: supplied.map(({feature: {name}, suppliers, colliding}) => ({
                    feature: name,
                    inputs: [...suppliers, ...colliding].sort((a, b) => a.imageIndex - b.imageIndex)
                }))})
            ))
        ]
    }
}

// The bands each derived feature is built of, by its name.
const derivedOf = supplied => Object.fromEntries(supplied
    .filter(({feature: {form}}) => [CALCULATED_FEATURE, COMBINED_FEATURE].includes(form))
    .map(({feature}) => [feature.name, requiredBands(feature)]))

const NO_FINDINGS = Object.freeze({missing: [], ambiguous: []})

// Each of the recipe's own inputs giving a name it, or another of them, gives again, whatever its case: as it spells them.
const ownAmbiguity = ({inputs, ambiguous}) => inputs.flatMap((features, imageIndex) => {
    const repeated = ambiguous.filter(({inputs}) => inputs.includes(imageIndex)).map(({spellings}) => spellings.map(name => name.toLowerCase()))
    const names = (features || []).map(({name}) => name).filter(name => repeated.some(lowered => lowered.includes(name.toLowerCase())))
    return names.length ? [{path: ['model', 'inputImagery', 'images', imageIndex], features: names}] : []
})

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
