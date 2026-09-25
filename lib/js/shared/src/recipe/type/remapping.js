import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromInputImagery, INPUT_IMAGE} from '../source/inputImagery.js'

// Remapping applies legend constraints to its input images (lib/js/ee/src/remapping/remapping.js). The legend
// describes output values, not sources.

export {INPUT_IMAGE}

// Each legend entry is a class value, so the band is categorical.
export const REMAPPING_BANDS = [
    {name: 'class', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mode'}
]

// Without entries there is no rule to remap by, and execution builds an image without bands.
export const hasRemappingLegend = model => Boolean(model?.legend?.entries?.length)

export const remappingBands = model => hasRemappingLegend(model) ? REMAPPING_BANDS : []

export default defineRecipeType({
    type: 'REMAPPING',
    directSources: model => fromInputImagery(model),
    imageOutput: imageOutputProvider({
        describe: ({recipe}) => ({bands: remappingBands(recipe.model), evidence: []})
    })
})
