import _ from 'lodash'

import {calculateBounds} from './confidenceInterval'
import {boundsToMarginOfError} from './marginOfError'

export const allocateToSampleSize = ({strata, sampleSize, minSamplesPerStratum, confidenceLevel}) => {
    const allocation = _.cloneDeep(strata).map(stratum => ({
        ...stratum,
        sampleSize: minSamplesPerStratum}))

    // console.log('initial', _.cloneDeep({minSamplesPerStratum, allocation}))
    const testAllocation = _.cloneDeep(allocation)
    let remaining = sampleSize - minSamplesPerStratum * strata.length
    while (remaining > 0) {
        let bestGain = -Infinity
        let bestStratum = -1

        for (let h = 0; h < strata.length; h++) {
            testAllocation[h].sampleSize += 1
            const gain = calculateMarginOfError(allocation) - calculateMarginOfError(testAllocation)
            if (gain > bestGain) {
                bestGain = gain
                bestStratum = h
            }
            testAllocation[h].sampleSize -= 1
        }
        if (bestStratum === -1) {
            throw Error('No best stratum')
        }
        allocation[bestStratum].sampleSize += 1
        testAllocation[bestStratum].sampleSize = allocation[bestStratum].sampleSize
        remaining -= 1
    }

    return allocation
    
    function calculateMarginOfError(allocation) {
        const bounds = calculateBounds({confidenceLevel, allocation})
        const marginOfError = boundsToMarginOfError(bounds)
        return marginOfError
    }
}

export const allocateToMarginOfError = ({strata, sampleSize, minSamplesPerStratum, confidenceLevel}) => {

}

