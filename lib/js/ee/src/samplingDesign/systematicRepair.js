// Pure helpers for the export-time "base + optional single repair" systematic density strategy. No EE
// imports, so they're directly unit-testable. The export task first materializes a conservative base set of
// unfiltered candidates, counts it, and (only if some strata underproduce) materializes one denser repair
// set for just those strata.

const rawOf = (summary, stratum) => summary.raw[String(stratum.stratum)] || 0

// Strata whose materialized candidates can't satisfy the requested count. A raw candidate count below the
// requested sample size is the shared signal: for EXACT/OVER it means too few candidates (no selected level
// can reach the requested count); for CLOSEST it's the conservative "denser candidates could plausibly get
// closer" case - CLOSEST never requires a full count, it just gets a chance to improve.
export const underproducingStrata = ({summary, allocation}) =>
    allocation.filter(stratum => rawOf(summary, stratum) < Number(stratum.sampleSize))

// Extra density offsets needed to cover a materialized deficit. Each +1 offset roughly quadruples the
// candidate density (grid spacing halved in both dimensions), so extraOffsets = ceil(log4(requested /
// rawCount)): 1 for a deficit up to 4x, 2 for up to 16x, 3 for up to 64x, ... (0 when already sufficient).
export const repairExtraOffsets = ({rawCount, requested}) => {
    const neededFactor = Number(requested) / Math.max(Number(rawCount), 1)
    return neededFactor > 1
        ? Math.ceil(Math.log(neededFactor) / Math.log(4))
        : 0
}

// A single repair offset for all underproducing strata. Each failing stratum's target is baseOffset + its
// deficit estimate + a small safety margin, clamped to THAT stratum's own densest allowed grid
// (maxOffsetOf) - so a stratum already at its minimum-distance limit contributes only baseOffset. The
// single repair export uses the largest such target (denser is safe: level selection and EXACT thinning
// trim surplus, and densifying a stratum past its own limit is a no-op). Returns baseOffset when no failing
// stratum can be densified - the caller reads offset <= baseOffset as "already at the minimum-distance
// limit" and skips the (pointless) repair export.
export const repairOffset = ({underproducing, summary, baseOffset = 0, maxOffsetOf, safety = 1}) =>
    underproducing.reduce((max, stratum) => {
        const extra = repairExtraOffsets({rawCount: rawOf(summary, stratum), requested: stratum.sampleSize})
        const stratumMax = maxOffsetOf ? maxOffsetOf(stratum) : Infinity
        const target = Math.min(baseOffset + extra + safety, stratumMax)
        return Math.max(max, target)
    }, baseOffset)

// Failing strata that can't be densified past the base grid because they're already at their own
// minimum-distance limit (own max offset <= baseOffset). For requireFull (EXACT/OVER), the presence of any
// such stratum means the requested counts can't be reached, so the caller should fail immediately with the
// min-distance-limit reason rather than spend a repair export that can't help them.
export const nonRepairableStrata = ({underproducing, baseOffset = 0, maxOffsetOf}) =>
    underproducing.filter(stratum => (maxOffsetOf ? maxOffsetOf(stratum) : Infinity) <= baseOffset)

// Per-stratum underproduction details for an error message: available = raw candidate count materialized
// (not the final selected count; missing means 0), requested = the requested sample size. `strata` is the
// already-identified underproducing set (from underproducingStrata).
export const underproductionDetails = ({summary, strata}) =>
    strata.map(stratum => ({
        stratum: stratum.stratum,
        label: stratum.label,
        available: rawOf(summary, stratum),
        requested: Number(stratum.sampleSize)
    }))

// Structured user-facing message per terminal reason. `{strata}` is filled from args so the GUI can
// localize by key (falling back to this default template, which interpolates the same arg).
const REASON_USER_MESSAGE = {
    // Repair can't densify further because the grid is already at the minimum-distance limit.
    minDistanceLimit: {
        key: 'tasks.samplingDesign.systematic.underproduced.minDistanceLimit',
        message: 'Sampling could not create enough sample candidates while respecting the minimum distance. Affected strata: {strata}. Try reducing the sample size for those strata, reducing the minimum distance, setting the sample size strategy to Closest, or checking whether the area of interest has enough usable area for those classes.'
    },
    // One denser repair export was tried and still fell short (we do not attempt another).
    repairExhausted: {
        key: 'tasks.samplingDesign.systematic.underproduced.repairExhausted',
        message: 'Sampling could not create enough sample candidates, even after creating additional candidates. Affected strata: {strata}. Try reducing the sample size for those strata, reducing the minimum distance, setting the sample size strategy to Closest, or checking whether the area of interest has enough usable area for those classes.'
    }
}

const describeStratum = ({stratum, label, available, requested}) =>
    `${label ? `${label} (stratum ${stratum})` : `stratum ${stratum}`}: ${available} available / ${requested} requested`

// Structured user-facing message for a terminal EXACT/OVER underproduction: a message key + default template
// (both with a `{strata}` placeholder) and args carrying the formatted failing strata (label + stratum,
// available/requested). Pure - task orchestration wraps this into a SEPAL exception.
export const underproductionUserMessage = ({details, reason}) => ({
    key: REASON_USER_MESSAGE[reason].key,
    message: REASON_USER_MESSAGE[reason].message,
    args: {strata: details.map(describeStratum).join('; ')}
})
