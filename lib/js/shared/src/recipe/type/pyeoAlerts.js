import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, fromClassificationSource} from '../source/collectionSources.js'

// PyEO alerts classifies a monitoring composite over its AOI using another Classification recipe
// (lib/js/ee/src/pyeo/pyeoAlerts.js), which it loads to reach that classification's own input imagery.
//
// Only the classification half of the shared submodel: PyEO builds its composite from enumerated data sets
// and has no `sources.assets` list.

export {CLASSIFICATION_SOURCE}

export default defineRecipeType({
    type: 'PYEO_ALERTS',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromClassificationSource(model)
    ]
})
