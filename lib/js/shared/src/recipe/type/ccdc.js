import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'
import {fromId, fromList, idResults} from '../source/extract.js'
import {assetReference, recipeReference} from '../source/reference.js'

// CCDC's direct sources, from what its Earth Engine implementation reads:
//
//   model.aoi                     clips the segments image and filters the collection
//                                 (lib/js/ee/src/timeSeries/ccdc.js)
//   model.sources.classification  a bare recipe id whose bands are added to the source collection
//                                 (lib/js/ee/src/timeSeries/collection.js)
//   model.sources.assets          bare ids of the Planet basemap/daily ImageCollections, merged in model
//                                 order (lib/js/ee/src/planet/collection.js)
//
// The classification is optional, so an absent one is silence. Every asset in the list is not: an entry
// that exists but has no id is a broken selection.

export const CLASSIFICATION_SOURCE = 'CLASSIFICATION_SOURCE'
export const SOURCE_IMAGERY = 'SOURCE_IMAGERY'

export default defineRecipeType({
    type: 'CCDC',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromId({
            model,
            keys: ['sources', 'classification'],
            toReference: recipeReference,
            role: CLASSIFICATION_SOURCE
        }),
        ...fromList({
            model,
            keys: ['sources', 'assets'],
            role: SOURCE_IMAGERY,
            itemResults: (id, path) => idResults({
                id,
                toReference: assetReference,
                role: SOURCE_IMAGERY,
                path,
                required: true
            })
        })
    ]
})
