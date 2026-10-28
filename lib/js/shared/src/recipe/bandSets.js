import {auxiliaryBands} from './auxiliaryImagery.js'
import {getAvailableIndexes, REQUIRED_BANDS_BY_INDEX} from './optical/opticalBands.js'
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

// How execution builds a feature of an input (addCovariates, lib/js/ee/src/classification/features.js): RAW, the input's
// band of that name selected as it is - a band an input provides under an index's name, such as a mosaic's stored ndvi,
// included; CALCULATED, an index calculated of the standard bands it requires, in physical units, overwriting a band of
// that name; COMBINED, a band combination of two of the input's bands (`operands`, in the input's band order, and
// `operation`); COVARIATE, a configured auxiliary covariate (auxiliaryImagery), which execution generates itself. The
// forms are not interchangeable: a provided index and a calculated one differ in units.
export const RAW_FEATURE = 'RAW'
export const CALCULATED_FEATURE = 'CALCULATED'
export const COMBINED_FEATURE = 'COMBINED'
export const COVARIATE_FEATURE = 'COVARIATE'

// The features an input with these bands gives a recipe, each once, in the form execution builds it: [{name, form,
// operands?, operation?}]. A name two band sets give is the later's, as execution overwrites it, and a configured
// covariate overwrites a band of its name. Null, establishing nothing, where two band combinations of one set share a
// name (a_b with c, a with b_c): Earth Engine renames the second by a rule not modelled here.
export const featuresOf = (bandSetSpecs = [], auxiliaryImagery = [], bands = []) => {
    const features = new Map()
    const add = feature => {
        features.delete(feature.name)
        features.set(feature.name, feature)
    }
    for (const bandSetSpec of bandSetSpecs) {
        const given = bandSetFeatures(bandSetSpec, bands)
        if (!given) {
            return null
        }
        given.forEach(add)
    }
    auxiliaryBands(auxiliaryImagery).forEach(name => add({name, form: COVARIATE_FEATURE}))
    return [...features.values()]
}

// The names of the features a recipe's samples carry over its own points, as execution builds the image it samples: its
// input image's features (featuresOf). Null, establishing nothing, where the input is not described, or where there are
// several - concatenated, Earth Engine renames the names they share by a rule not modelled here. An image without band
// sets is no image execution can build, rather than one sampling nothing.
export const sampledFeatures = (model, describedInputs) => {
    const images = model?.inputImagery?.images || []
    const bands = images.length === 1 && images[0].bandSetSpecs?.length ? describedBands(images[0], describedInputs) : null
    const features = bands && featuresOf(images[0].bandSetSpecs, model.auxiliaryImagery, bands)
    return features ? features.map(({name}) => name) : null
}

// The features a recipe trains on, requested of the training data it reuses, as each of its input images gives them
// (featuresOf): `inputs`, in its inputs' order, null for one not described, or whose combinations collide - its features
// unknown; and `ambiguous`, the names its described inputs give more than once, whatever their case - as a recipe
// reusing it matches them (matchingBands) - [{name, spellings, inputs: [imageIndex]}], `inputs` once each, and the band
// combinations of two bands differing only in case, which another recipe's one band would supply twice. A configured
// covariate is no ambiguity: execution generates it, the same for each input, under the names concatenation gives them.
export const requestedFeatures = (model, describedInputs) => {
    const inputs = (model?.inputImagery?.images || []).map(image => {
        const bands = image.bandSetSpecs?.length ? describedBands(image, describedInputs) : null
        return bands && featuresOf(image.bandSetSpecs, model.auxiliaryImagery, bands)
    })
    const given = new Map()
    inputs.forEach((features, imageIndex) => (features || [])
        .filter(({form}) => form !== COVARIATE_FEATURE)
        .forEach(({name}) => given.set(name.toLowerCase(), [...given.get(name.toLowerCase()) || [], {name, imageIndex}])))
    const caseless = inputs.flatMap((features, imageIndex) => (features || [])
        .filter(({form, operands}) => form === COMBINED_FEATURE && operands[0].toLowerCase() === operands[1].toLowerCase())
        .map(({name}) => ({name, spellings: [name], inputs: [imageIndex]})))
    return {
        inputs,
        ambiguous: [
            ...[...given.values()]
                .filter(givers => givers.length > 1)
                .map(givers => ({
                    name: givers[0].name,
                    spellings: [...new Set(givers.map(({name}) => name))],
                    inputs: [...new Set(givers.map(({imageIndex}) => imageIndex))]
                })),
            ...caseless
        ]
    }
}

// The bands of `bands` matching `name` whatever their case: one matching is that band, under the name asked for;
// several - red beside Red, whichever spells it as asked - are no match, never ranked.
export const matchingBands = (bands, name) => bands.filter(band => band.toLowerCase() === name.toLowerCase())

// The bands a feature in a form is built of, whatever their case: a band itself, an index's standard bands, a
// combination's operands. None for a covariate.
export const requiredBands = ({name, form, operands}) => {
    switch (form) {
        case RAW_FEATURE:
            return [name]
        case CALCULATED_FEATURE:
            return REQUIRED_BANDS_BY_INDEX[name] || [name]
        case COMBINED_FEATURE:
            return operands
        default:
            return []
    }
}

// Which of a recipe's input images supplies each feature requested of it (requestedFeatures), in the requested form, at
// its own points: [{feature, suppliers: [{imageIndex, bands}], colliding: [{imageIndex, bands}], unknown}] - `unknown`
// where an input is not described, which might supply it too. What the recipe's band sets select of its inputs plays no
// part: the request is the consumer's. An input supplies a feature where it holds each band the feature is built of
// (requiredBands) once, whatever its case (matchingBands) - a band itself for a RAW feature, every standard band of a
// CALCULATED index, both operands of a COMBINED one - and collides where it holds them all, one of them more than once.
// `bands` are the input's own spellings. Nothing is combined across inputs. A covariate is supplied by execution itself,
// and is not asked for. Exactly one supplier must supply each: none, with no input unknown, is missing; several, or any
// colliding, whatever is unknown, are ambiguous. A recipe without input images is refused for that itself, and
// establishes nothing here.
export const featureSupply = (requested, model, describedInputs) => {
    const inputBands = (model?.inputImagery?.images || []).map(image => describedBands(image, describedInputs))
    const unknown = !inputBands.length || inputBands.some(bands => !bands)
    const features = new Map()
    requested.inputs.flat().filter(feature => feature && feature.form !== COVARIATE_FEATURE)
        .forEach(feature => features.has(feature.name) || features.set(feature.name, feature))
    return [...features.values()].map(feature => {
        const matches = inputBands.map((bands, imageIndex) => {
            const matched = bands && requiredBands(feature).map(band => matchingBands(bands, band))
            return matched && matched.every(matching => matching.length) ? {imageIndex, matched} : null
        }).filter(Boolean)
        const asFound = ({imageIndex, matched}) => ({imageIndex, bands: matched.flat()})
        return {
            feature,
            suppliers: matches.filter(({matched}) => matched.every(matching => matching.length === 1)).map(asFound),
            colliding: matches.filter(({matched}) => matched.some(matching => matching.length > 1)).map(asFound),
            unknown
        }
    })
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

// What a band set adds to the image sampled, in the form execution builds each (featuresOf), or null where its band
// combinations share a name.
const bandSetFeatures = (bandSetSpec, bands) => {
    const available = availableSelections(bandSetSpec, bands)
    switch (bandSetSpec.type) {
        case IMAGE_BANDS: {
            const indexes = getAvailableIndexes(bands)
            return available.map(name => ({name, form: indexes.includes(name) ? CALCULATED_FEATURE : RAW_FEATURE}))
        }
        case INDEXES:
            return available.map(name => ({name, form: CALCULATED_FEATURE}))
        default: {
            const combined = bands.filter(band => available.includes(band))
            const operation = bandSetSpec.operation
            const features = combined.flatMap((first, i) => combined.slice(i + 1).map(second => ({
                name: `${first}_${second}_${operation.toLowerCase()}`, form: COMBINED_FEATURE, operands: [first, second], operation
            })))
            return new Set(features.map(({name}) => name)).size === features.length ? features : null
        }
    }
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
