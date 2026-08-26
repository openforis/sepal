import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'

// Phenology derives seasonality over its AOI from the same shared collection submodel
// (lib/js/ee/src/timeSeries/phenology.js). `sources.band` names which band of that collection it reads; it is
// a band name, not a reference.

export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

export default defineRecipeType({
    type: 'PHENOLOGY',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromCollectionSources(model)
    ]
})
