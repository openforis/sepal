import {inputBandSetRefusals} from '../bandSets.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromInputImagery, INPUT_IMAGE} from '../source/inputImagery.js'

// Clustering samples and clusters its input images (lib/js/ee/src/unsupervisedClassification/
// unsupervisedClassification.js). It has no training data at all, so its input imagery is its only
// reference. Described, and refused, over its input images' band sets as Classification is (bandSets.js).

export {INPUT_IMAGE}

// Cluster ids are categories, which averaging makes meaningless.
export const CLUSTER_BANDS = [
    {name: 'class', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mode'}
]

export default defineRecipeType({
    type: 'UNSUPERVISED_CLASSIFICATION',
    directSources: model => fromInputImagery(model),
    imageOutput: imageOutputProvider({
        describe: ({recipe, inputs, describedInputs}) => {
            const refusals = inputBandSetRefusals(recipe.model, describedInputs(INPUT_IMAGE))
            if (refusals.length) {
                return {diagnostics: refusals}
            }
            return inputs(INPUT_IMAGE) && {bands: CLUSTER_BANDS, evidence: []}
        }
    })
})
