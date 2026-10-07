import {BAYTS_HISTORICAL_STATS} from '../capability/baytsHistoricalStats.js'
import {HISTORICAL_STATISTICS, ORBIT_SUFFIXES} from '../type/baytsHistorical.js'
import {NEEDS_EVIDENCE, SUPPORTED, unsupported} from './verdict.js'

// The historical statistics a source supplies, as BAYTS alerts reads them (lib/js/ee/src/bayts/bayts.js). Pure: judged
// by `evaluate(facts, parameters)`, where `facts` describe the statistics of the producer the BAYTS_HISTORICAL_STATS capability
// arrives at (discoverProvider.js) - never the selection itself:
//
//   {producer: COMPUTED, passes: [orbit]}   statistics a recipe computes for the orbit passes it is configured with,
//                                           every statistic of each, in the layout BAYTS Historical builds
//   {producer: ASSET, assetId, bands: [{name, arrayDimensions}]}
//                                           statistics stored in an asset, each band with the array rank its metadata
//                                           states - undefined where none was established
//
// Without facts the answer is NEEDS_EVIDENCE. Whether the facts are current and authorized for the source selected now
// is the caller's to establish first.
//
// For each radar image of a pass it monitors, BAYTS selects the statistics whose names end in that pass's suffix,
// strips it, and reads `orbit` by name, and the `_mean`, `_std` and `_speckle` bands each as a pair matched against VV
// and VH by position - VV first. Statistics of other passes are never read. A pass is held where any of its statistics
// is, and usable where it is complete, scalar and so ordered, with no other band read as one of its statistics. Facts
// do not say which pass's imagery the statistics came from, or how they were filtered.

export const COMPUTED = 'COMPUTED'
export const ASSET = 'ASSET'

export const INCOMPATIBLE_HISTORICAL_STATISTICS = 'INCOMPATIBLE_HISTORICAL_STATISTICS'
export const INSUFFICIENT_HISTORICAL_EVIDENCE = 'INSUFFICIENT_HISTORICAL_EVIDENCE'
export const NO_HISTORICAL_PASS = 'NO_HISTORICAL_PASS'
export const MONITORED_PASS_ABSENT = 'MONITORED_PASS_ABSENT'
export const MALFORMED_MONITORED_PASSES = 'MALFORMED_MONITORED_PASSES'

// Statistics some pass can be monitored against: at least one pass usable. Where none is, a pass that may be usable
// but whose ranks are not established leaves it unestablished; otherwise what makes the passes held unusable refuses.
export const MONITORABLE_STATISTICS = {
    id: 'baytsHistoricalStats.monitorable',
    capability: BAYTS_HISTORICAL_STATS,
    evaluate: facts => {
        if (!facts) {
            return {status: NEEDS_EVIDENCE}
        }
        const assessed = assessedPasses(facts)
        const passes = usablePasses(assessed)
        const held = Object.values(assessed)
        return passes.length
            ? {status: SUPPORTED, passes}
            : insufficient(facts, held) || incompatible(facts, held) || unsupported({code: NO_HISTORICAL_PASS, ...assetOf(facts)})
    }
}

// The passes a consumer is configured to monitor, {orbits}, are each usable. Passes configured as anything but a list of
// orbit passes are refused as malformed. A pass not held is refused naming those that are usable; then anything making
// a monitored pass unusable, before ranks not established. Passes not monitored are not judged. No pass configured
// means nothing to check.
export const MONITORED_PASSES = {
    id: 'baytsHistoricalStats.monitoredPasses',
    capability: BAYTS_HISTORICAL_STATS,
    evaluate: (facts, {orbits = []} = {}) => {
        if (!facts) {
            return {status: NEEDS_EVIDENCE}
        }
        if (!Array.isArray(orbits) || orbits.some(orbit => !Object.hasOwn(ORBIT_SUFFIXES, orbit))) {
            return unsupported({code: MALFORMED_MONITORED_PASSES, ...assetOf(facts), orbits})
        }
        const assessed = assessedPasses(facts)
        const passes = usablePasses(assessed)
        const absent = orbits.filter(orbit => !assessed[orbit])
        if (absent.length) {
            return unsupported({code: MONITORED_PASS_ABSENT, ...assetOf(facts), absent, passes})
        }
        const monitored = orbits.map(orbit => assessed[orbit])
        return incompatible(facts, monitored) || insufficient(facts, monitored) || {status: SUPPORTED, passes}
    }
}

const PAIRED_STATISTICS = ['mean', 'std', 'speckle']

const SOUND = {missing: [], wrongDimensions: [], unexpected: [], misordered: [], undetermined: []}

// What is wrong with each pass held, by orbit, in the order of ORBIT_SUFFIXES. A computing producer builds every
// statistic of each pass it is configured with.
const assessedPasses = facts => {
    if (facts.producer !== ASSET) {
        return Object.fromEntries(facts.passes.filter(orbit => Object.hasOwn(ORBIT_SUFFIXES, orbit)).map(orbit => [orbit, SOUND]))
    }
    const names = facts.bands.map(({name}) => name)
    return Object.fromEntries(Object.entries(ORBIT_SUFFIXES)
        .filter(([_orbit, suffix]) => HISTORICAL_STATISTICS.some(statistic => names.includes(`${statistic}_${suffix}`)))
        .map(([orbit, suffix]) => [orbit, assessedPass(facts.bands, names, suffix)]))
}

const assessedPass = (bands, names, suffix) => {
    const required = HISTORICAL_STATISTICS.map(statistic => `${statistic}_${suffix}`)
    const read = PAIRED_STATISTICS.map(statistic => names.filter(name => name.endsWith(`_${statistic}_${suffix}`)))
    const requiredBands = bands.filter(({name}) => required.includes(name))
    return {
        missing: required.filter(name => !names.includes(name)),
        wrongDimensions: requiredBands
            .filter(({arrayDimensions}) => arrayDimensions !== undefined && arrayDimensions !== 0)
            .map(({name, arrayDimensions}) => ({band: name, expected: 0, actual: arrayDimensions})),
        unexpected: read.flat().filter(name => !required.includes(name)),
        misordered: read
            .map(found => found.filter(name => required.includes(name)))
            .filter(found => found.length === 2 && !found[0].startsWith('VV_'))
            .flat(),
        undetermined: requiredBands.filter(({arrayDimensions}) => arrayDimensions === undefined).map(({name}) => name)
    }
}

const isIncompatible = ({missing, wrongDimensions, unexpected, misordered}) =>
    Boolean(missing.length || wrongDimensions.length || unexpected.length || misordered.length)

const usablePasses = assessed => Object.entries(assessed)
    .filter(([_orbit, pass]) => !isIncompatible(pass) && !pass.undetermined.length)
    .map(([orbit]) => orbit)

const incompatible = (facts, passes) => {
    const found = passes.filter(isIncompatible)
    if (!found.length) {
        return null
    }
    const [unexpected, misordered] = ['unexpected', 'misordered'].map(problem => found.flatMap(pass => pass[problem]))
    return unsupported({
        code: INCOMPATIBLE_HISTORICAL_STATISTICS, ...assetOf(facts),
        missing: found.flatMap(({missing}) => missing),
        wrongDimensions: found.flatMap(({wrongDimensions}) => wrongDimensions),
        ...(unexpected.length && {unexpected}),
        ...(misordered.length && {misordered})
    })
}

const insufficient = (facts, passes) => {
    const undetermined = passes.filter(pass => !isIncompatible(pass)).flatMap(pass => pass.undetermined)
    return undetermined.length
        ? unsupported({code: INSUFFICIENT_HISTORICAL_EVIDENCE, ...assetOf(facts), undetermined})
        : null
}

const assetOf = ({assetId}) => assetId ? {assetId} : {}
