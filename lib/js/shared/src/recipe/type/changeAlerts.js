import {defineRecipeType} from '../defineRecipeType.js'
import {CLASSIFICATION_SOURCE, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'
import {fromSelection} from '../source/extract.js'

// Change alerts monitors a CCDC reference against a freshly built collection
// (lib/js/ee/src/timeSeries/changeAlerts.js). Two independent halves:
//
//   model.reference  the selected CCDC source, recipe OR asset. imageFactory resolves it either way, and its
//                    geometry is what the recipe is clipped to - there is no separate AOI.
//   model.sources    a COPY of the referenced CCDC recipe's whole submodel, assigned when the reference is
//                    selected (recipe/changeAlerts/referenceSync.jsx), or parsed out of a selected asset's
//                    `recipe_sources` property. So this recipe owns the same classification and asset
//                    dependencies CCDC does.

export const PRIMARY_IMAGE = 'PRIMARY_IMAGE'
export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

export default defineRecipeType({
    type: 'CHANGE_ALERTS',
    directSources: model => [
        ...fromSelection({model, keys: ['reference'], role: PRIMARY_IMAGE}),
        ...fromCollectionSources(model)
    ]
})
