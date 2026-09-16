import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'

// BAYTS historical derives speckle statistics over its AOI from a radar mosaic it builds itself
// (lib/js/ee/src/bayts/baytsHistorical.js), so the AOI is its one external reference.

// BAYTS historical computes the statistics itself, so there is no asset to read them from.
export const historicalStatsSource = {
    statsAsset: () => null
}

export default defineRecipeType({
    type: 'BAYTS_HISTORICAL',
    historicalStatsSource,
    directSources: model => fromAoi({model, keys: ['aoi']})
})
