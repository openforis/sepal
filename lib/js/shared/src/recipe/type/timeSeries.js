import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'

// A time series counts observations over its AOI from the collection the shared `sources` submodel describes
// (lib/js/ee/src/timeSeries/timeSeries.js, which builds it through timeSeries/collection.js).

export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

export default defineRecipeType({
    type: 'TIME_SERIES',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromCollectionSources(model)
    ]
})
