import {defineRecipeType} from '../defineRecipeType.js'
import {fromInputImagery, INPUT_IMAGE} from '../source/inputImagery.js'

// Band Math evaluates expressions over its input images (lib/js/ee/src/bandMath/bandMath.js). Calculations
// and output bands are configuration over the bands those images provide, not references.

export {INPUT_IMAGE}

export default defineRecipeType({
    type: 'BAND_MATH',
    directSources: model => fromInputImagery(model)
})
