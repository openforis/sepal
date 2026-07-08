// Pure underproduction detail formatting and user messages, shared by systematic and random exports. No EE
// and no task dependencies, so it's directly unit-testable and safe to import from either side.

// Per-stratum shortfall label used in error messages: "{label} (stratum {n}): {available} available /
// {requested} requested", falling back to "stratum {n}: ..." when there's no label.
export const describeStratum = ({stratum, label, available, requested}) =>
    `${label ? `${label} (stratum ${stratum})` : `stratum ${stratum}`}: ${available} available / ${requested} requested`

// Per-stratum shortfall detail from successfully-computed per-stratum counts + allocation. `available` is
// the count actually produced (missing -> 0); only strata below their requested size are returned.
export const shortfallDetails = ({counts, allocation}) =>
    allocation
        .map(stratum => ({
            stratum: stratum.stratum,
            label: stratum.label,
            available: (counts && counts[String(stratum.stratum)]) || 0,
            requested: Number(stratum.sampleSize)
        }))
        .filter(({available, requested}) => available < requested)

const RANDOM_USER_MESSAGE = {
    // minDistance thinning left some strata short.
    minDistance: {
        key: 'tasks.samplingDesign.random.underproduced.minDistance',
        message: 'Random sampling could not create enough samples while respecting the minimum distance. Affected strata: {strata}. Try reducing the sample size for those strata, reducing the minimum distance, or checking whether the area of interest has enough usable area for those classes.'
    },
    // No minDistance configured and still short - the classes just don't have enough usable area.
    insufficientArea: {
        key: 'tasks.samplingDesign.random.underproduced.insufficientArea',
        message: 'Random sampling could not create enough samples. Affected strata: {strata}. Try reducing the sample size for those strata or checking whether the area of interest has enough usable area for those classes.'
    }
}

// Structured user-facing message for a random underproduction. `hasMinDistance` selects the wording variant
// (with vs without the "minimum distance" guidance). `{strata}` is filled from args with the formatted
// failing strata. Task orchestration wraps this into a ClientException.
export const randomUnderproductionUserMessage = ({details, hasMinDistance}) => {
    const variant = hasMinDistance ? RANDOM_USER_MESSAGE.minDistance : RANDOM_USER_MESSAGE.insufficientArea
    return {
        key: variant.key,
        message: variant.message,
        args: {strata: details.map(describeStratum).join('; ')}
    }
}
