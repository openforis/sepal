import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'

// An optical mosaic composites a scene collection and clips it to its AOI
// (lib/js/ee/src/optical/mosaic.js). Its data sets are enumerated collection identifiers fixed in the
// implementation, not selections, so the AOI is its one external reference.

// An optical mosaic's own model states the collection it composited and the window it covers.
export const opticalCollectionDefaults = {
    defaultsAsset: () => null
}

export default defineRecipeType({
    type: 'MOSAIC',
    opticalCollectionDefaults,
    directSources: model => fromAoi({model, keys: ['aoi']})
})
