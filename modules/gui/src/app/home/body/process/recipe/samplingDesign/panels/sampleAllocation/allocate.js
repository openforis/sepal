import _ from 'lodash'

export const allocate = ({sampleSize, minSamplesPerStratum = 1, strategy, strata, tuningConstant}) => {
    if (minSamplesPerStratum > sampleSize / strata.length) {
        throw new Error('Unable to meet minSamplesPerStratum with provided sampleSize and number of strata')
    }
    const recurse = sampleSizeToTest => {
        const allocation = allocateSamples({sampleSize: sampleSizeToTest, minSamplesPerStratum, strategy, strata, tuningConstant})
        const updateAllocation = allocation.map(stratum => {
            const adjusted = stratum.sampleSize < minSamplesPerStratum
            return {
                ...stratum,
                sampleSize: adjusted
                    ? minSamplesPerStratum
                    : stratum.sampleSize,
                adjusted
            }
        })
        const allocationSampleSize = _.sumBy(updateAllocation, 'sampleSize')
        const excessSamples = allocationSampleSize - sampleSize
        const nextSampleSizeToTest = sampleSizeToTest - excessSamples
        if (excessSamples > 0 && nextSampleSizeToTest < sampleSizeToTest) {
            return recurse(nextSampleSizeToTest)
        } else {
            return updateAllocation
        }
    }

    const allocation = recurse(sampleSize)
    return adjustToSampleSize({sampleSize, minSamplesPerStratum, allocation})
}

const adjustToSampleSize = ({sampleSize, minSamplesPerStratum, allocation}) => {
    const allocated = _.sumBy(allocation, 'sampleSize')
    const diff = sampleSize - allocated
    if (!diff) {
        return allocation
    } else {
        const step = diff / Math.abs(diff)
        return allocation.reduce(
            ({adjustment, adjustedStrata}, stratum) => {
                const sampleSize = Math.max(1, stratum.sampleSize + step)
                return adjustment === diff
                    && sampleSize >= minSamplesPerStratum
                    && !stratum.adjusted
                    ? {
                        adjustment,
                        adjustedStrata: [
                            ...adjustedStrata,
                            _.omit(stratum, ['adjusted'])
                        ]
                    }
                    : {
                        adjustment: adjustment + step,
                        adjustedStrata: [
                            ...adjustedStrata,
                            {
                                ..._.omit(stratum, ['adjusted']),
                                sampleSize
                            }]
                    }
            },
            {
                adjustment: 0,
                adjustedStrata: []
            }
        ).adjustedStrata
    }
}
const allocateSamples = ({sampleSize, strategy, strata, tuningConstant}) => {
    switch (strategy) {
    case 'EQUAL': return equalAllocation({sampleSize, strata})
    case 'PROPORTIONAL': return proportionalAllocation({sampleSize, strata})
    case 'OPTIMAL': return optimalAllocation({sampleSize, strata})
    case 'POWER': return powerAllocation({sampleSize, strata, tuningConstant})
    case 'BALANCED': return balancedAllocation({sampleSize, strata})
    }
}

const equalAllocation = ({sampleSize, strata}) => {
    return strata.map(stratum => ({
        ...stratum,
        sampleSize: Math.ceil(sampleSize / strata.length)
    }))
}

const proportionalAllocation = ({sampleSize, strata}) => {
    return strata.map(stratum => ({
        ...stratum,
        sampleSize: Math.round(sampleSize * stratum.weight)
    }))
}

const optimalAllocation = ({sampleSize, strata}) => {
    return powerAllocation({sampleSize, strata, tuningConstant: 1})
}

const powerAllocation = ({sampleSize, strata, tuningConstant}) => {
    const nominators = strata.map(stratum => {
        const populationMean = stratum.proportion
        const weight = stratum.weight
        const standardDeviation = Math.sqrt(populationMean * (1 - populationMean))
        const coefficientOfVariation = standardDeviation / populationMean
        const importance = weight * populationMean
        return ({
            ...stratum,
            nominator: coefficientOfVariation * Math.pow(importance, tuningConstant)
        })
    })
    const sum = _.sumBy(nominators, 'nominator')
    return nominators.map(stratum => ({
        ..._.omit(stratum, ['nominator']),
        sampleSize: Math.round(sampleSize * stratum.nominator / sum)
    }))
}

const balancedAllocation = ({sampleSize, strata}) => {
    const proportional = proportionalAllocation({sampleSize, strata})
    const equal = equalAllocation({sampleSize, strata})
    return _.zip(proportional, equal)
        .map(([proportionalStratum, equalStratum]) => ({
            ...proportionalStratum,
            sampleSize: (proportionalStratum.sampleSize + equalStratum.sampleSize) / 2
        }))
}

