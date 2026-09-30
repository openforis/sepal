import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromSelection} from '../source/extract.js'

// Index change compares two index images (lib/js/ee/src/indexChange/indexChange.js).
//
// Two independent selections, each of which can be a recipe or an asset. Their roles are the whole meaning of
// the recipe: swapping them inverts the change being measured, so they can never share one role.

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
    imageOutput: imageOutputProvider({
        describe: ({recipe}) => ({bands: indexChangeBands(recipe.model), evidence: []})
    })
})

function scalar(name, pyramidingPolicy) {
    return {name, dataType: {arrayDimensions: 0}, pyramidingPolicy}
}
