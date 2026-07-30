import {allocate} from './allocate'
import {calculateBounds} from './confidenceInterval'

// Single source of truth for turning confidence bounds into a margin of error, used by both the
// sample-size solver and the panel's manual-mode display so absolute/relative can't diverge.
export const boundsToMarginOfError = ({bounds: [lower, proportion, upper], relative}) => {
    const estimatedMarginOfError = Math.max(proportion - lower, upper - proportion)
    if (!relative) {
        return estimatedMarginOfError
    }
    // Relative margin of error is undefined at a zero overall proportion; treat it as unreachable
    // rather than returning NaN/Infinity, so the solver degrades gracefully.
    return proportion ? estimatedMarginOfError / proportion : Infinity
}

export const calculateMarginOfError = ({sampleSize, relativeMarginOfError, confidenceLevel, strategy, minSamplesPerStratum, strata, tuningConstant}) => {
    const allocation = allocate({sampleSize, strategy, minSamplesPerStratum, strata, tuningConstant})
    const bounds = calculateBounds({confidenceLevel, allocation})
    return boundsToMarginOfError({bounds, relative: relativeMarginOfError})
}
