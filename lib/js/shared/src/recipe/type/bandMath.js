import _ from 'lodash'

import {defineRecipeType} from '../defineRecipeType.js'
import {CONFLICTING_OBSERVATION, DUPLICATE_BAND_NAME, MISSING_INPUT_BAND, NO_OUTPUT_BANDS} from '../output/diagnostic.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromInputImagery, INPUT_IMAGE} from '../source/inputImagery.js'

// Band Math evaluates expressions over its input images (lib/js/ee/src/bandMath/bandMath.js). Calculations
// and output bands are configuration over the bands those images provide, not references.
//
// Its output is the output bands it is configured with, in configured order, each under its final name. Whether
// one is an array is not configured: a cast sets only the element type, an expression over an array band yields one,
// and some reducers keep arrays while others refuse them. So the running image is observed for that alone, and must
// carry exactly the configured names. A calculation no output band takes from is intermediate and never output.
//
// A scalar is averaged at coarser pyramid levels, as Earth Engine's default always exported it; an array is sampled.
// A band whose dimensionality the observation does not report is not described. Calculations change values, so no
// encoding is stated, even for a band passed through from an input.
//
// Execution selects every band an input includes, whether a calculation reads it or not, so each must be a band of
// that input's current description - never of the band list copied when it was selected. A band an input is described
// without is refused where it is included, whatever the running image's observation says: Earth Engine fails to build
// that image. Reading the inputs holds each to its whole description, as any recipe reading another is held: an input
// that cannot be described makes Band Math indescribable too, even where Earth Engine would build what it selects -
// duplicate output names it renames included. Both readings are asked for before either is tested, so one discovery
// pass requests them together.
//
// A configuration that cannot be built - output names repeated, or no band output at all - is refused from the
// configuration alone, before anything is observed. The refusal still names the inputs, and adds every band missing
// from those that could be described: what a caller holds, or reads to explain the refusal, says what else needs
// repair, without ever delaying it.

export {INPUT_IMAGE}

const OUTPUT_IMAGES_PATH = ['model', 'outputBands', 'outputImages']
const IMAGES_PATH = ['model', 'inputImagery', 'images']

// The final name of a configured output band: the one the user gave it, or the default the form generated.
export const outputBandName = ({outputName, defaultOutputName}) => outputName || defaultOutputName

export const bandMathOutputNames = model =>
    configuredOutputBands(model).map(({name}) => name)

export default defineRecipeType({
    type: 'BAND_MATH',
    directSources: model => fromInputImagery(model),
    imageOutput: imageOutputProvider({
        describe: ({recipe, inputs, describedInputs, observation}) => {
            const configured = configuredOutputBands(recipe.model)
            const refusals = configurationRefusals(configured)
            if (refusals.length) {
                return {diagnostics: [...refusals, ...missingInputBands(recipe.model, describedInputs())]}
            }
            const described = inputs()
            const observed = observation()
            const missing = described ? missingInputBands(recipe.model, described) : []
            if (missing.length) {
                return {diagnostics: missing}
            }
            if (!described || !observed) {
                return null
            }
            const names = configured.map(({name}) => name)
            return _.isEqual(observed.bands.map(({name}) => name), names)
                ? {bands: observed.bands.map(({name, dataType}) => outputBand(name, dataType)), evidence: []}
                : {diagnostics: [{code: CONFLICTING_OBSERVATION, path: ['model', 'outputBands']}]}
        }
    })
})

const configuredOutputBands = model =>
    (model?.outputBands?.outputImages || []).flatMap(({outputBands}, imageIndex) =>
        (outputBands || []).map((band, bandIndex) => ({
            name: outputBandName(band),
            path: [...OUTPUT_IMAGES_PATH, imageIndex, 'outputBands', bandIndex]
        }))
    )

// Every included band the description of its input does not hold, where it is included, among the inputs described.
const missingInputBands = (model, described) =>
    (model?.inputImagery?.images || []).flatMap((image, imageIndex) => {
        const input = described.find(({description: {executionReference}}) =>
            executionReference.type === image.type && executionReference.id === image.id
        )
        if (!input) {
            return []
        }
        const available = new Set(input.description.output.bands.map(({name}) => name))
        return (image.includedBands || []).flatMap(({name}, bandIndex) => available.has(name)
            ? []
            : [{code: MISSING_INPUT_BAND, path: [...IMAGES_PATH, imageIndex, 'includedBands', bandIndex]}]
        )
    })

const configurationRefusals = configured => configured.length
    ? duplicateNames(configured).map(({path}) => ({code: DUPLICATE_BAND_NAME, path}))
    : [{code: NO_OUTPUT_BANDS, path: OUTPUT_IMAGES_PATH}]

// Every band repeating a name an earlier band already has.
const duplicateNames = configured =>
    configured.filter(({name}, index) => configured.findIndex(other => other.name === name) < index)

const outputBand = (name, dataType) => {
    const arrayDimensions = dataType?.arrayDimensions
    if (!Number.isInteger(arrayDimensions)) {
        return {name}
    }
    return {name, dataType: {arrayDimensions}, pyramidingPolicy: arrayDimensions > 0 ? 'sample' : 'mean'}
}
