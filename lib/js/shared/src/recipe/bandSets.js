import {getAvailableIndexes} from './optical/opticalBands.js'
import {INSUFFICIENT_INPUT_BANDS, MISSING_INPUT_BAND, UNDERIVABLE_INPUT_INDEX} from './output/diagnostic.js'

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
        const input = describedInputs.find(({description: {executionReference}}) =>
            executionReference.type === image.type && executionReference.id === image.id
        )
        if (!input) {
            return []
        }
        const bands = input.description.output.bands.map(({name}) => name)
        return bandSetFindings(image.bandSetSpecs, bands)
            .map(({code, path}) => ({code, path: [...IMAGES_PATH, imageIndex, 'bandSetSpecs', ...path]}))
    })

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
