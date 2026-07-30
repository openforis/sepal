import _ from 'lodash'

export const smartRound = num => {
    if (num === 0) return 0
    if (!num) return num
    const abs = Math.abs(num)
    const basePrecision = 2
    const rounded = Number(num.toFixed(basePrecision))
    if (rounded !== 0) {
        return rounded
    }
    const extraPrecision = Math.ceil(-Math.log10(abs))
    const totalPrecision = Math.min(extraPrecision + 1, 15)
    return Number(num.toFixed(totalPrecision))
}

// Upper bound (in %) for the anticipated overall proportion, given the per-stratum probabilities.
// Returns 100 (no constraint) when there are no probabilities or the maximum probability is zero,
// so the result is never NaN/Infinity.
export const maxAnticipatedTargetProportion = ({strata, probabilityPerStratum}) => {
    if (!probabilityPerStratum) {
        return 100
    }
    const maxStratumProportion = _.max(probabilityPerStratum.map(({probability}) => probability))
    if (!maxStratumProportion) {
        return 100
    }
    const overallProportion = _.sum(
        probabilityPerStratum.map(({stratum, probability}) => {
            const weight = strata.find(({value}) => value === stratum)?.weight || 0
            return weight * probability
        })
    )
    return _.ceil(100 * overallProportion / maxStratumProportion, 2)
}

// Derives anticipated proportions per stratum from the per-stratum probabilities. When the weighted
// overall probability is zero (empty or all-zero probabilities), every proportion is zero rather than NaN.
export const toProportions = ({percentage, targetOverallProportion, strata, probabilityPerStratum}) => {
    const probabilityOf = value =>
        probabilityPerStratum.find(({stratum}) => stratum === value)?.probability || 0
    const overallProbability = _.sum(strata.map(({value, weight}) => weight * probabilityOf(value)))
    const probabilityFactor = !overallProbability
        ? 0
        : targetOverallProportion >= 0
            ? targetOverallProportion / overallProbability
            : percentage ? 1 : 100
    return strata.map(({label, color, value, area, weight}) => ({
        stratum: value,
        label,
        color,
        weight,
        area: smartRound(area),
        proportion: smartRound(probabilityOf(value) * probabilityFactor)
    }))
}
