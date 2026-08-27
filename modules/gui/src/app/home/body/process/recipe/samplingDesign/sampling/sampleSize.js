import {MIN_SAMPLES_PER_STRATUM, minimumTotalSampleSize} from '#sepal/recipe/samplingDesign/minSamples'

import {calculateMarginOfError} from './marginOfError'
import {findRoot} from './solve'

export const calculateSampleSize = ({
    marginOfError,
    strategy,
    minSamplesPerStratum = MIN_SAMPLES_PER_STRATUM,
    strata,
    tuningConstant,
    confidenceLevel
}) => {
    const fun = sampleSize =>
        calculateMarginOfError({
            sampleSize, confidenceLevel, strategy, minSamplesPerStratum, strata, tuningConstant
        }) - marginOfError
    const max = 1e12
    const min = Math.max(MIN_SAMPLES_PER_STRATUM, minimumTotalSampleSize({effectiveMinimum: minSamplesPerStratum, strataCount: strata.length}))
    const sampleSize = findRoot({fun, min, max})
    // Infeasible (e.g. relative margin of error at a zero overall proportion, or a target unreachable
    // within the range): the found size does not actually meet the target. Signal with Infinity so the
    // panel's validation can reject it rather than presenting a bogus minimum sample size.
    return Number.isFinite(sampleSize) && fun(sampleSize) <= 0
        ? sampleSize
        : Infinity
}
