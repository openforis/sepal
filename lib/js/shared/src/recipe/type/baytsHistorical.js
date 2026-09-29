import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'

// BAYTS historical derives speckle statistics over its AOI from a radar mosaic it builds itself
// (lib/js/ee/src/bayts/baytsHistorical.js), so the AOI is its one external reference.

// BAYTS historical computes the statistics itself, so there is no asset to read them from.
export const historicalStatsSource = {
    statsAsset: () => null
}

// What each orbit pass contributes, in the order execution builds it: the radar time scan's statistics and orbit,
// then the speckle statistics added to them.
export const HISTORICAL_STATISTICS = ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit', 'VV_speckle', 'VH_speckle']

export const ORBIT_SUFFIXES = {ASCENDING: 'asc', DESCENDING: 'desc'}

// Every pass's statistics under its suffix, in the order the model stores the passes.
export const baytsHistoricalBandNames = model =>
    model.options.orbits.flatMap(orbit =>
        HISTORICAL_STATISTICS.map(statistic => `${statistic}_${ORBIT_SUFFIXES[orbit]}`)
    )

export default defineRecipeType({
    type: 'BAYTS_HISTORICAL',
    historicalStatsSource,
    directSources: model => fromAoi({model, keys: ['aoi']})
})
