import {MISSING_ROLE} from '../output/diagnostic.js'
import {IMAGE_OUTPUT, TRAINING_DATA} from '../output/readiness.js'
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

export const INPUT_IMAGERY_PATH = ['model', 'inputImagery', 'images']

// Running the image needs one input image at least: execution zips the images, and builds nothing from none
// (output/readiness.js) - nor, producing training data, samples anything, its samples silently dropped. An image selected but not yet read, unreadable or gone is the closure's and the description's
// to judge; only a list holding none is this.
export const inputImageryRequirement = {
    code: MISSING_ROLE,
    operations: [IMAGE_OUTPUT, TRAINING_DATA],
    findings: model => model?.inputImagery?.images?.length ? [] : [{path: INPUT_IMAGERY_PATH}]
}

// Whether a type's declared requirement is this one, as the geometry layer asks (recipeGeometryLayer.jsx). A
// requirement is its rule, `findings`; the operations it holds for are each type's to extend (type/classification.js),
// and a copy that extends them is still this requirement.
export const isInputImageryRequirement = requirement =>
    requirement?.findings === inputImageryRequirement.findings
