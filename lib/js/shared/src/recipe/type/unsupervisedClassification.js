import {defineRecipeType} from '../defineRecipeType.js'
import {fromInputImagery, INPUT_IMAGE} from '../source/inputImagery.js'

// Clustering samples and clusters its input images (lib/js/ee/src/unsupervisedClassification/
// unsupervisedClassification.js). It has no training data at all, so its input imagery is its only
// reference.

export {INPUT_IMAGE}

export default defineRecipeType({
    type: 'UNSUPERVISED_CLASSIFICATION',
    directSources: model => fromInputImagery(model)
})
