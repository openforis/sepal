import _ from 'lodash'

import {calculateMarginOfError} from './marginOfError'
import {findRoot} from './solve'

export const calculateSampleSize = ({
    marginOfError,
    relativeMarginOfError,
    strategy,
    minSamplesPerStratum = 0,
    strata,
    tuningConstant,
    confidenceLevel
}) => {
    const fun = sampleSize =>
        calculateMarginOfError({
            sampleSize, relativeMarginOfError, confidenceLevel, strategy, minSamplesPerStratum, strata, tuningConstant
        }) - marginOfError
    const max = 1e12
    const min = Math.max(1, minSamplesPerStratum * strata.length)
    return findRoot({fun, min, max})
}
