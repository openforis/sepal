import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT} from '../output/readiness.js'
import {selectedBandRefusals} from '../selectedBands.js'
import {fromSelection} from '../source/extract.js'

// Index change compares two index images (lib/js/ee/src/indexChange/indexChange.js).
//
// Two independent selections, each of which can be a recipe or an asset. Their roles are the whole meaning of
// the recipe: swapping them inverts the change being measured, so they can never share one role.
//
// It is described only once both images are, and refused where either selects an index band, or an error band where
// one is configured, that its image's current description does not provide (selectedBands.js).

export const FROM_IMAGE = 'FROM_IMAGE'
export const TO_IMAGE = 'TO_IMAGE'

// The bands execution builds, in its order. Error and confidence need an error band on both images; change needs a
// legend to classify the difference by. Without one the comparisons are still a complete output.
export const indexChangeBands = model => [
    scalar('difference', 'mean'),
    scalar('normalized_difference', 'mean'),
    scalar('ratio', 'mean'),
    ...(hasErrorBands(model) ? [scalar('error', 'mean'), scalar('confidence', 'mean')] : []),
    ...(hasChangeLegend(model) ? [scalar('change', 'mode')] : [])
]

export const hasErrorBands = model => Boolean(model?.fromImage?.errorBand && model?.toImage?.errorBand)

export const hasChangeLegend = model => Boolean(model?.legend?.entries?.length)

export default defineRecipeType({
    type: 'INDEX_CHANGE',
    directSources: model => [
        ...fromSelection({model, keys: ['fromImage'], role: FROM_IMAGE}),
        ...fromSelection({model, keys: ['toImage'], role: TO_IMAGE})
    ],
    executionNeeds: {[IMAGE_OUTPUT]: {[FROM_IMAGE]: IMAGE_OUTPUT, [TO_IMAGE]: IMAGE_OUTPUT}},
    imageOutput: imageOutputProvider({
        describe: ({recipe, inputs, describedInputs}) => {
            const refusals = selectedBandRefusals(recipe.model, describedInputs, SELECTED_BANDS)
            if (refusals.length) {
                return {diagnostics: refusals}
            }
            return inputs(FROM_IMAGE) && inputs(TO_IMAGE) && {bands: indexChangeBands(recipe.model), evidence: []}
        }
    })
})

const SELECTED_BANDS = [
    {role: FROM_IMAGE, key: 'fromImage', fields: ['band', 'errorBand']},
    {role: TO_IMAGE, key: 'toImage', fields: ['band', 'errorBand']}
]

function scalar(name, pyramidingPolicy) {
    return {name, dataType: {arrayDimensions: 0}, pyramidingPolicy}
}
