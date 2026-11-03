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

// A classifier that is trained, configured with training data known not to hold what its training needs of the points it
// trains on (trainingSamplesRequirement): points of too few classes, no point of the class it trains on, or a class of too
// few points. Named on the finding by `need` - MINIMUM_CLASSES, with the `classes` the points are of and the `minimum`;
// TRAINED_CLASS, with the `classes` it trains on that no point is of; MINIMUM_CLASS_SAMPLES, with the `classes` the
// points are of, none of them of as many points as the `minimum` - classes by their values. Said only of training data
// holding points - none at all is NO_TRAINING_DATA - and only once every recipe in its reuse is known: one not held, or
// that cannot produce training data, may hold what is not found. Judged of the points stored, which bound those sampled:
// a point the imagery masks, or lies beyond, is not trained on, so each need is one that what sampling leaves cannot meet
// where the points stored do not - while what this does not find sampling may still fall short of.
export const INSUFFICIENT_TRAINING_SAMPLES = 'INSUFFICIENT_TRAINING_SAMPLES'

export const MINIMUM_CLASSES = 'MINIMUM_CLASSES'
export const TRAINED_CLASS = 'TRAINED_CLASS'
export const MINIMUM_CLASS_SAMPLES = 'MINIMUM_CLASS_SAMPLES'

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
export const noTrainingData = (model, context) => {
    const {points, complete} = trainingSamples(model, context)
    return !points && complete
}

// What the points a configuration trains on are known to be, judged as noTrainingData judges them:
// {points, counts, complete} - whether any is stored; how many of each class are, as a Map from the class's value as a
// string to {value, count}; and whether every recipe its data sets reuse is established, so that what is not among them
// is known not to be stored. A recipe reused along two data sets' reuse is counted along each, as execution samples it
// along each.
export const trainingSamples = (model, {recordsOf, declares} = {}) =>
    storedTraining(model, {recordsOf, declares, judged: new Map()})

// The requirement that a recipe whose classifier is trained - for its image, or by default only there, as `operations`
// say - has something to train on, found where `missing(model, context)` holds (output/readiness.js).
export const trainingDataRequirement = (missing, operations = [IMAGE_OUTPUT]) => ({
    code: NO_TRAINING_DATA,
    operations,
    findings: (model, context) => missing(model, context) ? [{path: TRAINING_DATA_PATH}] : []
})

// The requirement that a recipe whose classifier is trained - for its image, or by default only there, as `operations`
// say - holds what its training needs of the points it trains on, as `needsOf(model)` declares it: {classes, trainsOn,
// classSamples} - how many classes its points must be of at least, the class some must be of, and how many points one
// class at least must have, any of them - or null where it is not trained. A data set need not meet them alone:
// what is trained on is all of them together (INSUFFICIENT_TRAINING_SAMPLES).
export const trainingSamplesRequirement = (needsOf, operations = [IMAGE_OUTPUT]) => ({
    code: INSUFFICIENT_TRAINING_SAMPLES,
    operations,
    findings: (model, context) => {
        const needs = needsOf(model)
        const samples = needs && trainingSamples(model, context)
        return samples?.complete && samples.points
            ? shortfallsOf(needs, samples.counts).map(shortfall => ({path: TRAINING_DATA_PATH, ...shortfall}))
            : []
    }
})

const shortfallsOf = ({classes, trainsOn, classSamples}, counts) => {
    const stored = [...counts.values()]
    const values = stored.map(({value}) => value)
    return [
        ...classes && stored.length < classes ? [{need: MINIMUM_CLASSES, classes: values, minimum: classes}] : [],
        ...trainsOn !== undefined && !counts.has(String(trainsOn)) ? [{need: TRAINED_CLASS, classes: [trainsOn]}] : [],
        ...classSamples && stored.every(({count}) => count < classSamples)
            ? [{need: MINIMUM_CLASS_SAMPLES, classes: values, minimum: classSamples}]
            : []
    ]
}

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

// The points a configuration stores and those of the recipes its data sets reuse, each judged once in a read.
const storedTraining = (model, read, record) => {
    const dataSets = model?.trainingData?.dataSets || []
    const points = dataSets
        .filter(dataSet => dataSet?.type !== 'RECIPE')
        .flatMap(dataSet => dataSet?.referenceData || [])
    const reused = dataSets.filter(dataSet => dataSet?.type === 'RECIPE')
    const providers = reused.length ? read.recordsOf?.(TRAINING_DATA_SOURCE, record) : []
    const known = Boolean(providers) && providers.length === reused.length
    return (known ? providers : []).reduce(
        (training, provider) => joined(training, reusedTraining(provider, read)),
        {
            points: points.length > 0,
            counts: summed(NO_COUNTS, points.map(point => point?.class).filter(isClass).map(value => ({value, count: 1}))),
            complete: known
        }
    )
}

// A recipe reached again along a cycle, which its dependencies are refused for, establishes nothing.
const reusedTraining = (provider, read) => {
    if (!read.judged.has(provider.id)) {
        read.judged.set(provider.id, UNESTABLISHED)
        read.judged.set(provider.id, read.declares?.(provider, TRAINING_DATA)
            ? storedTraining(provider.model, read, provider)
            : UNESTABLISHED)
    }
    return read.judged.get(provider.id)
}

const joined = (training, other) => ({
    points: training.points || other.points,
    counts: summed(training.counts, other.counts.values()),
    complete: training.complete && other.complete
})

const summed = (counts, added) => {
    const sum = new Map(counts)
    for (const {value, count} of added) {
        const key = String(value)
        sum.set(key, {value: sum.get(key)?.value ?? value, count: (sum.get(key)?.count || 0) + count})
    }
    return sum
}

const isClass = value => value !== null && value !== undefined && value !== ''

const NO_COUNTS = new Map()

const UNESTABLISHED = Object.freeze({points: false, counts: NO_COUNTS, complete: false})
