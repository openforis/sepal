// The sampling-design minimum-sample contract, defined once for both the GUI panel and the task layer
// (`#sepal/recipe/samplingDesign/minSamples` resolves to this file from modules/gui, modules/task and modules/gee).
//
// A stratum with fewer than two samples carries no within-stratum variance estimate, so two is a hard
// statistical floor: it holds regardless of allocation strategy or systematic sample-size strategy, and no
// configuration can go below it.
export const MIN_SAMPLES_PER_STRATUM = 2

// Manual allocation exists in two saved shapes: the boolean model field and the old form-toggle array
// (non-empty when on). Both must be recognized so a saved `true` is not mistaken for automatic allocation.
export const isManualAllocation = manual =>
    Array.isArray(manual) ? manual.length > 0 : !!manual

// Whether the design configures its own minimum at all. EQUAL and manual allocation expose no field and carry
// the implicit statistical floor; every other automatic strategy must state its own minimum. This single
// decision drives the panel's field visibility, both GUI validators and the task preflight, so those four
// cannot drift apart.
export const usesConfiguredMinSamplesPerStratum = ({allocationStrategy, manual} = {}) =>
    !isManualAllocation(manual) && allocationStrategy !== 'EQUAL'

// Strategies without a configurable minimum floor at the statistical one; the rest raise the floor to the
// configured value whenever it is higher. An unstratified design is a single synthetic stratum, so the same
// floor applies to its total.
export const effectiveMinSamplesPerStratum = ({allocationStrategy, minSamplesPerStratum, manual} = {}) => {
    if (!usesConfiguredMinSamplesPerStratum({allocationStrategy, manual})) {
        return MIN_SAMPLES_PER_STRATUM
    }
    const configured = Number(minSamplesPerStratum)
    return Number.isFinite(configured)
        ? Math.max(MIN_SAMPLES_PER_STRATUM, Math.trunc(configured))
        : MIN_SAMPLES_PER_STRATUM
}

// A configured minimum is only valid when it is an integer at or above the statistical floor.
export const isValidMinSamplesPerStratum = value => {
    const number = Number(value)
    return Number.isInteger(number) && number >= MIN_SAMPLES_PER_STRATUM
}

// Every requested per-stratum sample size (manual row or allocated row) must clear the statistical floor.
export const isValidStratumSampleSize = value => {
    const number = Number(value)
    return Number.isInteger(number) && number >= MIN_SAMPLES_PER_STRATUM
}

// The smallest total that can satisfy the floor across all included strata.
export const minimumTotalSampleSize = ({effectiveMinimum, strataCount}) =>
    effectiveMinimum * strataCount
