import {fromList, selectionResults} from './extract.js'

// The `inputImagery.images` submodel, shared by every recipe that zips an ordered list of selected images.
// Position decides band order in the zipped result, so the list is never reordered or deduplicated.
//
// Only the canonical `type` and `id` are read. The panel behind one of these lists
// (panels/inputImagery/inputImage.jsx valuesToModel) also persists `recipe` and `asset` as separate bare-id
// copies and does not clear them when the section changes, so a RECIPE_REF image routinely carries a stale
// asset id from an earlier selection. Reading either of those would resolve a source the user abandoned.

export const INPUT_IMAGE = 'INPUT_IMAGE'

export const fromInputImagery = model =>
    fromList({
        model,
        keys: ['inputImagery', 'images'],
        role: INPUT_IMAGE,
        itemResults: (image, path) => selectionResults({selection: image, role: INPUT_IMAGE, path})
    })
