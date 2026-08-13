import {allocate} from './allocate'
import {calculateBounds} from './confidenceInterval'

// Margin of error relative to the anticipated overall proportion (Sampling Design is relative only).
export const boundsToMarginOfError = ({bounds: [lower, proportion, upper]}) => {
    const estimatedMarginOfError = Math.max(proportion - lower, upper - proportion)
    // Undefined at a zero overall proportion; treat it as unreachable (Infinity) rather than NaN so the
    // solver degrades gracefully.
    return proportion ? estimatedMarginOfError / proportion : Infinity
}

export const calculateMarginOfError = ({sampleSize, confidenceLevel, strategy, minSamplesPerStratum, strata, tuningConstant}) => {
    const allocation = allocate({sampleSize, strategy, minSamplesPerStratum, strata, tuningConstant})
    const bounds = calculateBounds({confidenceLevel, allocation})
    return boundsToMarginOfError({bounds})
}
