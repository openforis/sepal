export const isPositiveIntegerSampleSize = value =>
    value != null && value !== '' && /^[1-9]\d*$/.test(String(value))

export const shouldDeferFixedSampleSizeAllocation = ({manual, estimateSampleSize, sampleSize}) =>
    !manual?.length && !estimateSampleSize && !isPositiveIntegerSampleSize(sampleSize)
