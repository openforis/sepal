import {defineRecipeType} from '../defineRecipeType.js'
import {fromSelection} from '../source/extract.js'

// Masking applies one image as a mask to another (lib/js/ee/src/masking.js). Both inputs come from the same
// panel form (modules/gui/src/app/home/body/process/recipe/masking/panels/inputImage/inputImage.jsx
// valuesToModel), which stores a section as {type, id} alongside the bands and visualizations loaded off the
// source when it was selected. Only the type and id are structure; the rest is a snapshot of one source and
// never a second dependency.
//
// Both inputs change the output pixels, so both are edges. Which of them carries the wrapper's semantic
// identity is not decided here: this declares direct edges and roles only.

export const PRIMARY_IMAGE = 'PRIMARY_IMAGE'
export const MASK_IMAGE = 'MASK_IMAGE'

export default defineRecipeType({
    type: 'MASKING',
    directSources: model => [
        ...fromSelection({model, keys: ['imageToMask'], role: PRIMARY_IMAGE}),
        ...fromSelection({model, keys: ['imageMask'], role: MASK_IMAGE})
    ]
})
