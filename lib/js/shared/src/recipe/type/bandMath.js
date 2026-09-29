import _ from 'lodash'

import {defineRecipeType} from '../defineRecipeType.js'
import {CONFLICTING_OBSERVATION, DUPLICATE_BAND_NAME} from '../output/diagnostic.js'
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
// A verified scalar is averaged at coarser pyramid levels, as Earth Engine's default always exported it; a verified
// array is sampled. A band whose dimensionality was not observed states neither. Calculations change values, so no
// encoding is stated, even for a band passed through from an input.

export {INPUT_IMAGE}

const OUTPUT_IMAGES_PATH = ['model', 'outputBands', 'outputImages']

// The final name of a configured output band: the one the user gave it, or the default the form generated.
export const outputBandName = ({outputName, defaultOutputName}) => outputName || defaultOutputName

export const bandMathOutputNames = model =>
    configuredOutputBands(model).map(({name}) => name)

export default defineRecipeType({
    type: 'BAND_MATH',
    directSources: model => fromInputImagery(model),
    imageOutput: imageOutputProvider({
        describe: ({recipe, observation}) => {
            const configured = configuredOutputBands(recipe.model)
            const duplicates = duplicateNames(configured)
            if (duplicates.length) {
                return {diagnostics: duplicates.map(({path}) => ({code: DUPLICATE_BAND_NAME, path}))}
            }
            if (!configured.length) {
                return {bands: [], evidence: []}
            }
            const observed = observation()
            if (!observed) {
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
