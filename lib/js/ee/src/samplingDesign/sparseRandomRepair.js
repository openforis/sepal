// Pure threshold and repair rules for sparse rank-based stratified Random sampling (no Earth Engine).
//
// Thresholds are a runtime knob only: they bound how many candidate cells materialize, never which cells are
// selected (selection is always the lowest requested ranks per stratum). Kept pure so the rules are unit-tested
// directly and run unmocked inside the export orchestration.

export const MIN_EXPECTED_CANDIDATES = 10
// Doubling from any positive threshold reaches 1 in log2(1/t) steps (~30 for t=1e-9); 40 is a safe backstop that
// still guarantees a threshold-1 attempt before the limit can be hit in any realistic frame.
export const MAX_REPAIR_ROUNDS = 40

// threshold_h = min(1, max(multiplier * n_h, MIN_EXPECTED_CANDIDATES) / (area_h / scale^2)). Uses the allocation's
// existing per-stratum area, so no extra Earth Engine reduction is introduced. The floor keeps small requests
// from repairing needlessly (at multiplier 2, n=2 would otherwise expect only 4 candidates).
export const initialThresholds = ({allocation, scale, multiplier = 2, minCandidates = MIN_EXPECTED_CANDIDATES}) => {
    const pixelArea = Number(scale) * Number(scale)
    return allocation.map(stratum => {
        const eligibleEstimate = Math.max(1, Number(stratum.area || 0) / pixelArea)
        const target = Math.max(multiplier * Number(stratum.sampleSize), minCandidates)
        return Math.min(1, target / eligibleEstimate)
    })
}

// Decide the next step from the current thresholds and the running per-stratum candidate counts. Exactly one flag
// is set:
//   {done}                                              every stratum has at least its requested count
//   {underproduction}                                   a deficient stratum is already at threshold 1
//   {repairLimit}                                        the round budget was exhausted before reaching threshold 1
//   {repair, loThresholds, hiThresholds, nextThresholds, widenedStrata}
//       export the disjoint half-open interval [lo_h, hi_h) for the deficient strata (empty [t,t) for the rest)
// Thresholds only ever increase (double, clamped to 1); non-deficient strata are never repaired.
export const repairStep = ({thresholds, counts, allocation, round = 0}) => {
    const deficient = allocation
        .map((stratum, index) => ({stratum, index}))
        .filter(({stratum}) => (Number(counts[stratum.stratum]) || 0) < Number(stratum.sampleSize))
    if (!deficient.length) {
        return {done: true}
    }
    // Never report a genuine shortfall while a deficient stratum can still widen toward threshold 1.
    const widenable = deficient.filter(({index}) => thresholds[index] < 1)
    if (!widenable.length) {
        return {underproduction: true}
    }
    if (round >= MAX_REPAIR_ROUNDS) {
        return {repairLimit: true}
    }
    const widenIndexes = new Set(widenable.map(({index}) => index))
    const nextThresholds = thresholds.map((threshold, index) =>
        widenIndexes.has(index) ? Math.min(1, threshold * 2) : threshold)
    // Deficient strata get the new interval [old, new); every other stratum gets an empty interval [new, new).
    const loThresholds = thresholds.map((threshold, index) =>
        widenIndexes.has(index) ? threshold : nextThresholds[index])
    return {
        repair: true,
        loThresholds,
        hiThresholds: nextThresholds,
        nextThresholds,
        widenedStrata: widenable.map(({stratum}) => stratum.stratum)
    }
}
