import {mayProvide} from './providerStep.js'

// The BAYTS_HISTORICAL_STATS capability: which recipe or asset actually produced the historical statistics
// a source stands for.
//
// A candidate is not evidence. An Asset Mosaic declares that it stands for whatever its asset holds, which
// says where to look and nothing about what is there; nothing here establishes that an asset really carries
// BAYTS statistics.

export const BAYTS_HISTORICAL_STATS = {
    name: 'BAYTS_HISTORICAL_STATS',
    // What a producer declares: where the statistics live when they live in an asset, and null when the
    // recipe computes them itself.
    declaration: 'historicalStatsSource'
}

export const mayProvideHistoricalStats = type =>
    mayProvide(type, BAYTS_HISTORICAL_STATS)
