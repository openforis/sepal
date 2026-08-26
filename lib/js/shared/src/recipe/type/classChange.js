import {defineRecipeType} from '../defineRecipeType.js'
import {fromSelection} from '../source/extract.js'

// Class change compares two classified images (lib/js/ee/src/classChange/classChange.js).
//
// Two independent selections, each of which can be a recipe or an asset. Their roles are the whole meaning of
// the recipe: swapping them inverts the change being measured, so they can never share one role.

export const FROM_IMAGE = 'FROM_IMAGE'
export const TO_IMAGE = 'TO_IMAGE'

export default defineRecipeType({
    type: 'CLASS_CHANGE',
    directSources: model => [
        ...fromSelection({model, keys: ['fromImage'], role: FROM_IMAGE}),
        ...fromSelection({model, keys: ['toImage'], role: TO_IMAGE})
    ]
})
