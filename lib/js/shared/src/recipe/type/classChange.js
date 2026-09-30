import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromSelection} from '../source/extract.js'

// Class change compares two classified images (lib/js/ee/src/classChange/classChange.js).
//
// Two independent selections, each of which can be a recipe or an asset. Their roles are the whole meaning of
// the recipe: swapping them inverts the change being measured, so they can never share one role.

export const FROM_IMAGE = 'FROM_IMAGE'
export const TO_IMAGE = 'TO_IMAGE'

// The code of each transition: from-entry i to to-entry j is i * (to entries) + j + 1, in each legend's own entry
// order, which is the order the user sees and may have chosen. Execution computes the same codes.
export const classTransitions = (fromEntries, toEntries) =>
    fromEntries.flatMap((from, i) =>
        toEntries.map((to, j) => ({value: i * toEntries.length + j + 1, from, to}))
    )

// Both bands, whatever the images hold. A confidence is measured from both images' probability bands; where either
// holds none, it is masked rather than absent.
export const CLASS_CHANGE_BANDS = [
    {name: 'transition', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mode'},
    {name: 'confidence', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}
]

export default defineRecipeType({
    type: 'CLASS_CHANGE',
    directSources: model => [
        ...fromSelection({model, keys: ['fromImage'], role: FROM_IMAGE}),
        ...fromSelection({model, keys: ['toImage'], role: TO_IMAGE})
    ],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: CLASS_CHANGE_BANDS, evidence: []})
    })
})
