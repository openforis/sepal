import {defineRecipeType} from '../defineRecipeType.js'
import {fromInputImagery, INPUT_IMAGE} from '../source/inputImagery.js'

// Stack renames and concatenates its input images in model order (lib/js/ee/src/stack/stack.js). The output
// band names are a mapping over that list, not references.

export {INPUT_IMAGE}

export default defineRecipeType({
    type: 'STACK',
    directSources: model => fromInputImagery(model)
})
