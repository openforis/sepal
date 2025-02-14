import {allocate} from './allocate'
import {calculateBounds} from './confidenceInterval'

export const calculateMarginOfError = ({sampleSize, relativeMarginOfError, confidenceLevel, strategy, minSamplesPerStratum, strata, tuningConstant}) => {
    const allocation = allocate({sampleSize, strategy, minSamplesPerStratum, strata, tuningConstant})
    const [lower, proportion, upper] = calculateBounds({confidenceLevel, allocation})
    const estimatedMarginOfError = Math.max(proportion - lower, upper - proportion)
    return relativeMarginOfError
        ? estimatedMarginOfError / proportion
        : estimatedMarginOfError
    
}
