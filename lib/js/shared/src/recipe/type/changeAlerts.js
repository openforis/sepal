import {defineRecipeType} from '../defineRecipeType.js'
import {CLASSIFICATION_SOURCE, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'
import {fromSelection} from '../source/extract.js'

// Change alerts monitors a CCDC reference against a freshly built collection
// (lib/js/ee/src/timeSeries/changeAlerts.js). Two independent halves:
//
//   model.reference  the selected CCDC source, recipe OR asset. imageFactory resolves it either way, and its
//                    geometry is what the recipe is clipped to - there is no separate AOI.
//   model.sources    the collection Change Alerts monitors against, seeded from the producer of the
//                    referenced segments and editable afterwards. So this recipe owns the same
//                    classification and asset dependencies CCDC does.

export const PRIMARY_IMAGE = 'PRIMARY_IMAGE'
export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

export default defineRecipeType({
    type: 'CHANGE_ALERTS',
    directSources: model => [
        ...fromSelection({model, keys: ['reference'], role: PRIMARY_IMAGE}),
        ...fromCollectionSources(model)
    ]
})
