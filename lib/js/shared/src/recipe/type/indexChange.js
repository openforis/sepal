import {defineRecipeType} from '../defineRecipeType.js'
import {fromSelection} from '../source/extract.js'

// Index change compares two index images (lib/js/ee/src/indexChange/indexChange.js).
//
// Two independent selections, each of which can be a recipe or an asset. Their roles are the whole meaning of
// the recipe: swapping them inverts the change being measured, so they can never share one role.

export const FROM_IMAGE = 'FROM_IMAGE'
export const TO_IMAGE = 'TO_IMAGE'

export default defineRecipeType({
    type: 'INDEX_CHANGE',
    directSources: model => [
        ...fromSelection({model, keys: ['fromImage'], role: FROM_IMAGE}),
        ...fromSelection({model, keys: ['toImage'], role: TO_IMAGE})
    ]
})
