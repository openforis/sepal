import {BAYTS_HISTORICAL_STATS} from '#sepal/recipe/capability/baytsHistoricalStats'
import {
    ASSET,
    COMPUTED,
    INCOMPATIBLE_HISTORICAL_STATISTICS,
    INSUFFICIENT_HISTORICAL_EVIDENCE,
    MALFORMED_MONITORED_PASSES,
    MONITORABLE_STATISTICS as MONITORABLE,
    MONITORED_PASS_ABSENT,
    MONITORED_PASSES as MONITORED,
    NO_HISTORICAL_PASS
} from '#sepal/recipe/requirement/baytsHistoricalStats'
import {baytsHistoricalRefusals} from '#sepal/recipe/type/baytsHistorical'
import {assetAvailableBands} from '~/app/home/map/imageLayerSource/assetBands'
import {msg} from '~/translate'

// The GUI's side of the BAYTS_HISTORICAL_STATS capability, and the requirements BAYTS alerts holds its reference to as
// the GUI reads them (lib/js/shared/src/recipe/requirement/baytsHistoricalStats.js): which asset establishes the
// statistics, the facts the requirement judges from what BAYTS Alerts' observation read (`historicalStats`,
// referenceObservation.js), and what a diagnosis means.

// Where a producer's statistics live, from the terms it declared. Null for one that computes them.
export const statsAssetOf = ({assetId, record, declared}) =>
    assetId !== undefined
        ? assetId
        : declared?.statsAsset?.(record.model) ?? null

// What an observation of a producer records of its statistics, from what it already read: an asset's typed bands, in
// the order it stores them, or the passes a computing recipe is configured with - none where its orbits are unusable.
export const historicalStatsOf = ({producer, metadata}) => {
    const statsAsset = statsAssetOf(producer)
    if (statsAsset) {
        return {
            assetId: statsAsset,
            bands: Object.entries(assetAvailableBands(metadata))
                .map(([name, {dataType: {arrayDimensions}}]) => ({name, arrayDimensions}))
        }
    }
    const model = producer.record?.model
    return {passes: baytsHistoricalRefusals(model).length ? [] : model.options.orbits}
}

export const HISTORICAL_STATS = {
    capability: BAYTS_HISTORICAL_STATS,
    label: 'process.source.capability.baytsHistoricalStats',
    evidenceAsset: provider => statsAssetOf(provider),
    factsOf: (observed, assetId) => factsOf(observed?.historicalStats, assetId)
}

export const MONITORABLE_STATISTICS = {
    ...MONITORABLE,
    capability: HISTORICAL_STATS,
    describe: diagnostic => describeDiagnostic(diagnostic)
}

// Facts only from the asset that establishes them; a computing producer's are its passes.
const factsOf = (stats, assetId) => {
    if (assetId) {
        return stats?.assetId === assetId ? {producer: ASSET, assetId, bands: stats.bands} : null
    }
    return stats?.passes ? {producer: COMPUTED, passes: stats.passes} : null
}

export const MONITORED_PASSES = {
    ...MONITORED,
    capability: HISTORICAL_STATS,
    describe: diagnostic => describeDiagnostic(diagnostic)
}

const REPRESENTATIVE = 3

const describeDiagnostic = diagnostic => {
    switch (diagnostic.code) {
        case INCOMPATIBLE_HISTORICAL_STATISTICS: {
            const problems = structureProblems(diagnostic)
            return {
                message: msg('process.source.historicalStats.incompatible', {asset: diagnostic.assetId, problems: representative(problems, '; ')}),
                details: problems
            }
        }
        case INSUFFICIENT_HISTORICAL_EVIDENCE:
            return {
                message: msg('process.source.historicalStats.undetermined', {
                    asset: diagnostic.assetId, count: diagnostic.undetermined.length, bands: representative(diagnostic.undetermined)
                }),
                details: diagnostic.undetermined
            }
        case NO_HISTORICAL_PASS:
            return {message: msg('process.source.historicalStats.noPass'), details: []}
        case MALFORMED_MONITORED_PASSES:
            return {message: msg('process.source.historicalStats.malformedPasses'), details: []}
        case MONITORED_PASS_ABSENT:
            return {
                message: msg(
                    diagnostic.passes.length
                        ? 'process.source.historicalStats.passAbsent'
                        : 'process.source.historicalStats.passAbsentNoAlternative',
                    {absent: passLabels(diagnostic.absent), count: diagnostic.absent.length, passes: passLabels(diagnostic.passes)}
                ),
                details: []
            }
        default:
            return null
    }
}

const structureProblems = ({missing, wrongDimensions, unexpected = [], misordered = []}) => [
    ...missing.map(band => msg('process.source.historicalStats.missingBand', {band})),
    ...wrongDimensions.map(({band}) => msg('process.source.historicalStats.arrayBand', {band})),
    ...unexpected.map(band => msg('process.source.historicalStats.unexpectedBand', {band})),
    ...misordered.length ? [msg('process.source.historicalStats.misordered', {bands: misordered.join(', ')})] : []
]

const passLabels = orbits => orbits
    .map(orbit => msg(`process.baytsHistorical.panel.options.form.orbits.${orbit.toLowerCase()}.label`))
    .join(', ')

const representative = (items, separator = ', ') => items.length > REPRESENTATIVE
    ? msg('process.source.segments.andMore', {items: items.slice(0, REPRESENTATIVE).join(separator), count: items.length - REPRESENTATIVE})
    : items.join(separator)
