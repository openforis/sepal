import {auxiliaryBands} from './auxiliaryImagery.js'
import {getAvailableIndexes} from './optical/opticalBands.js'
import {MISSING_INPUT_BAND} from './output/diagnostic.js'
import {INPUT_IMAGE} from './source/inputImagery.js'

// The band sets an input image of Classification, Regression or Unsupervised Classification is configured with, and
// which of their selections a source with given bands provides - as execution builds them (lib/js/ee/src/classification/
// classification.js addCovariates, and its copies in regression and unsupervisedClassification):
//
//   IMAGE_BANDS           bands the source has, or indexes derived from them where a name is an index
//   PAIR_WISE_EXPRESSION  bands the source has, combined pair by pair: nothing is combined from fewer than two
//   INDEXES               indexes derivable from the bands the source has
//
// Execution skips what a source does not provide. Configured, it is refused instead: one rule, read by the recipes'
// output declarations over their inputs' current descriptions and by the editor of an input over its source's.

// An index selected from an input whose current description does not hold the bands it is derived from.
export const UNDERIVABLE_INPUT_INDEX = 'UNDERIVABLE_INPUT_INDEX'

// A band combination given selections, fewer than two of which its input's current description holds: nothing can be
// combined.
export const INSUFFICIENT_INPUT_BANDS = 'INSUFFICIENT_INPUT_BANDS'

export const IMAGE_BANDS = 'IMAGE_BANDS'
export const PAIR_WISE_EXPRESSION = 'PAIR_WISE_EXPRESSION'
export const INDEXES = 'INDEXES'

const IMAGES_PATH = ['model', 'inputImagery', 'images']

// The selections of a band set a source with these bands provides, in configured order.
export const availableSelections = (bandSetSpec, bands = []) => {
    const included = bandSetSpec.included || []
    switch (bandSetSpec.type) {
        case IMAGE_BANDS: {
            const indexes = getAvailableIndexes(bands)
            return included.filter(name => bands.includes(name) || indexes.includes(name))
        }
        case PAIR_WISE_EXPRESSION:
            return included.filter(name => bands.includes(name))
        case INDEXES: {
            const indexes = getAvailableIndexes(bands)
            return included.filter(name => indexes.includes(name))
        }
        default:
            throw Error(`Unsupported band set spec: ${JSON.stringify(bandSetSpec)}`)
    }
}

// Whether a band combination is given selections but provided fewer than two of them.
export const isInsufficient = (bandSetSpec, bands = []) =>
    bandSetSpec.type === PAIR_WISE_EXPRESSION
    && (bandSetSpec.included || []).length > 0
    && availableSelections(bandSetSpec, bands).length < 2

// What a source with these bands establishes is wrong with an input's band sets: [{code, path}], `path` within the band
// sets - a selection's [set, 'included', selection], or a band combination's [set] where too few remain.
export const bandSetFindings = (bandSetSpecs, bands) =>
    (bandSetSpecs || []).flatMap((bandSetSpec, set) => {
        const available = availableSelections(bandSetSpec, bands)
        const unavailable = (bandSetSpec.included || []).flatMap((name, selection) => available.includes(name)
            ? []
            : [{code: bandSetSpec.type === INDEXES ? UNDERIVABLE_INPUT_INDEX : MISSING_INPUT_BAND, path: [set, 'included', selection]}])
        return isInsufficient(bandSetSpec, bands)
            ? [...unavailable, {code: INSUFFICIENT_INPUT_BANDS, path: [set]}]
            : unavailable
    })

// What the inputs that could be described establish about the band sets of the images selecting them, located in the
// model. An image whose source was not described establishes nothing: neither that it lacks a band, nor that it has one.
export const inputBandSetRefusals = (model, describedInputs) =>
    (model?.inputImagery?.images || []).flatMap((image, imageIndex) => {
        const bands = describedBands(image, describedInputs)
        return bands
            ? bandSetFindings(image.bandSetSpecs, bands)
                .map(({code, path}) => ({code, path: [...IMAGES_PATH, imageIndex, 'bandSetSpecs', ...path]}))
            : []
    })

// The names of the features a recipe's samples carry, as execution builds the image it samples (addCovariates): what its
// input image's band sets provide - a band combination named for each pair of its selections the input has, in the
// input's band order - and its auxiliary covariates, each name once. Null, establishing nothing, where the input is not
// described, or where there are several: Earth Engine renames the names they share by a rule not modelled here - as it
// does two band combinations of one set sharing a name (a_b with c, a with b_c), which establish nothing either. A name
// two band sets give is overwritten, so it is one feature. An image without band sets is no image execution can build,
// rather than one sampling nothing.
export const sampledFeatures = (model, describedInputs) => {
    const images = model?.inputImagery?.images || []
    const bands = images.length === 1 && images[0].bandSetSpecs?.length ? describedBands(images[0], describedInputs) : null
    const provided = bands && images[0].bandSetSpecs.map(bandSetSpec => providedFeatures(bandSetSpec, bands))
    return provided && provided.every(Boolean)
        ? [...new Set([...provided.flat(), ...auxiliaryBands(model.auxiliaryImagery)])]
        : null
}

// The same refusals for an operation that samples its inputs without describing the recipe they are configured in:
// producing training data (TRAINING_DATA) builds those images and samples what its band sets select, so what they do not
// provide refuses it as it refuses the recipe's image (output/readiness.js). One requirement per code, each of the
// codes its image is refused for, at the same paths; what an input awaits, or could not be read, finds nothing here.
export const inputBandSetRequirements = operations => [MISSING_INPUT_BAND, UNDERIVABLE_INPUT_INDEX, INSUFFICIENT_INPUT_BANDS]
    .map(code => ({
        code,
        operations,
        findings: (model, {describedInputs}) => inputBandSetRefusals(model, describedInputs(INPUT_IMAGE))
            .filter(finding => finding.code === code)
            .map(({path}) => ({path}))
    }))

// The bands an input image's current description holds, or null where it was not described.
const describedBands = (image, describedInputs) => {
    const input = describedInputs.find(({description: {executionReference}}) =>
        executionReference.type === image.type && executionReference.id === image.id
    )
    return input ? input.description.output.bands.map(({name}) => name) : null
}

// What a band set adds to the image sampled, or null where its band combinations share a name.
const providedFeatures = (bandSetSpec, bands) => {
    const available = availableSelections(bandSetSpec, bands)
    if (bandSetSpec.type !== PAIR_WISE_EXPRESSION) {
        return available
    }
    const combined = bands.filter(band => available.includes(band))
    const suffix = bandSetSpec.operation.toLowerCase()
    const names = combined.flatMap((first, i) => combined.slice(i + 1).map(second => `${first}_${second}_${suffix}`))
    return new Set(names).size === names.length ? names : null
}

// A finding located in the model, as the image it is about and where in that image's band sets: {imageIndex, set,
// selection}, `selection` null for one about the whole set; null for a path not about an input's band sets.
export const bandSetLocation = path => {
    const [model, inputImagery, images, imageIndex, bandSetSpecs, set, included, selection] = path || []
    const located = model === IMAGES_PATH[0] && inputImagery === IMAGES_PATH[1] && images === IMAGES_PATH[2]
        && Number.isInteger(imageIndex) && bandSetSpecs === 'bandSetSpecs' && Number.isInteger(set)
    if (!located) {
        return null
    }
    return {imageIndex, set, selection: included === 'included' && Number.isInteger(selection) ? selection : null}
}
