import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'
import {fromSourceAssets, SOURCE_IMAGERY} from '../source/collectionSources.js'

// A Planet mosaic merges the ImageCollections named in `model.sources.assets`, in model order, and clips to
// its AOI (lib/js/ee/src/planet/mosaic.js). It never classifies, so it takes the asset half of the shared
// collection submodel and not the classification half.
//
// When `sources` is absent entirely the implementation falls back to three hardcoded NICFI collections. Those
// are fixed in the implementation rather than selected, so an unconfigured recipe declares no assets.

export {SOURCE_IMAGERY}

export default defineRecipeType({
    type: 'PLANET_MOSAIC',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromSourceAssets(model)
    ]
})
