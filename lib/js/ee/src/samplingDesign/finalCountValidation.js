import {MIN_SAMPLES_PER_STRATUM} from '#sepal/recipe/samplingDesign/minSamples'

// Classification of one stratum's FINAL selected count, in strict priority order. The kinds are ordered by
// how fundamental the failure is, so a stratum that misses several bars is reported by the most fundamental
// one and the advice stays coherent.
export const FINAL_COUNT_KIND = {
    statisticalMinimum: 'statisticalMinimum',
    configuredMinimum: 'configuredMinimum',
    requestedAllocation: 'requestedAllocation',
    valid: 'valid'
}

// OVER and EXACT promise at least the requested allocation, as does random sampling. CLOSEST is the only mode
// allowed to undershoot the request - and only once the effective minimum is already satisfied.
const requiresRequestedCount = ({arrangementStrategy, sampleSizeStrategy}) =>
    arrangementStrategy === 'RANDOM' || sampleSizeStrategy === 'OVER' || sampleSizeStrategy === 'EXACT'

export const classifyStratumCount = ({actual, requested, effectiveMinimum, arrangementStrategy, sampleSizeStrategy}) => {
    if (actual < MIN_SAMPLES_PER_STRATUM) {
        return FINAL_COUNT_KIND.statisticalMinimum
    }
    if (actual < effectiveMinimum) {
        return FINAL_COUNT_KIND.configuredMinimum
    }
    if (requiresRequestedCount({arrangementStrategy, sampleSizeStrategy}) && actual < Number(requested)) {
        return FINAL_COUNT_KIND.requestedAllocation
    }
    return FINAL_COUNT_KIND.valid
}

// Classify every allocated stratum against the counted final collection, keeping only the failures.
// `counts` is the {stratumValue: count} histogram of the final collection.
export const classifyFinalCounts = ({counts, allocation, effectiveMinimum, arrangementStrategy, sampleSizeStrategy}) =>
    allocation
        .map(stratum => {
            const actual = (counts && counts[String(stratum.stratum)]) || 0
            const requested = Number(stratum.sampleSize)
            return {
                stratum: stratum.stratum,
                label: stratum.label,
                actual,
                requested,
                kind: classifyStratumCount({actual, requested, effectiveMinimum, arrangementStrategy, sampleSizeStrategy})
            }
        })
        .filter(({kind}) => kind !== FINAL_COUNT_KIND.valid)

// Failures grouped by their highest-priority reason, in reporting order.
export const groupFinalCountFailures = failures =>
    [FINAL_COUNT_KIND.statisticalMinimum, FINAL_COUNT_KIND.configuredMinimum, FINAL_COUNT_KIND.requestedAllocation]
        .map(kind => ({kind, strata: failures.filter(failure => failure.kind === kind)}))
        .filter(({strata}) => strata.length)
