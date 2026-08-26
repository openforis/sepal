import {defineRecipeType} from '../defineRecipeType.js'
import {fromInputImagery, INPUT_IMAGE} from '../source/inputImagery.js'

// Remapping applies legend constraints to its input images (lib/js/ee/src/remapping/remapping.js). The legend
// describes output values, not sources.

export {INPUT_IMAGE}

export default defineRecipeType({
    type: 'REMAPPING',
    directSources: model => fromInputImagery(model)
})
