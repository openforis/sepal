import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'

// A radar mosaic composites Sentinel-1 and clips to its AOI (lib/js/ee/src/radar/mosaic.js). The collection
// is fixed in the implementation, so the AOI is its one external reference.

export default defineRecipeType({
    type: 'RADAR_MOSAIC',
    directSources: model => fromAoi({model, keys: ['aoi']})
})
