import {isPositiveIntegerSampleSize} from '../../sampling/allocationOutcome'

export {isPositiveIntegerSampleSize}

export const shouldDeferFixedSampleSizeAllocation = ({manual, estimateSampleSize, sampleSize}) =>
    !manual?.length && !estimateSampleSize && !isPositiveIntegerSampleSize(sampleSize)
