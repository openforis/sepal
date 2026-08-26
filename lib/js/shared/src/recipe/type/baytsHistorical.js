import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'

// BAYTS historical derives speckle statistics over its AOI from a radar mosaic it builds itself
// (lib/js/ee/src/bayts/baytsHistorical.js), so the AOI is its one external reference.

export default defineRecipeType({
    type: 'BAYTS_HISTORICAL',
    directSources: model => fromAoi({model, keys: ['aoi']})
})
