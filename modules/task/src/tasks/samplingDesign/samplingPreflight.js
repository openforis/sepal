import {isStratificationSkipped} from '#sepal/ee/samplingDesign/stratificationSkip'
import {ClientException} from '#sepal/exception'
import {
    effectiveMinSamplesPerStratum,
    isManualAllocation,
    isValidMinSamplesPerStratum,
    isValidStratumSampleSize,
    MIN_SAMPLES_PER_STRATUM,
    usesConfiguredMinSamplesPerStratum
} from '#sepal/recipe/samplingDesign/minSamples'

const KEY = 'tasks.samplingDesign.preflight'

const interpolate = (message, args) =>
    message.replace(/{(\w+)}/g, (match, name) => name in args ? String(args[name]) : match)

const clientException = (key, message, args) =>
    new ClientException(interpolate(message, args), {userMessage: {key: `${KEY}.${key}`, message, args}})

const describe = ({label, stratum, sampleSize}) => `${label || `stratum ${stratum}`} (${sampleSize})`

const allocationMode = ({estimateSampleSize, manual}) =>
    isManualAllocation(manual) ? 'manual' : estimateSampleSize ? 'error' : 'samples'

export const samplingDesignPreflightError = recipe => {
    const {model: {stratification, sampleAllocation}} = recipe
    const {allocation = [], minSamplesPerStratum, allocationStrategy, estimateSampleSize, manual} = sampleAllocation || {}
    const unstratified = isStratificationSkipped(stratification)
    const effectiveMinimum = effectiveMinSamplesPerStratum({allocationStrategy, minSamplesPerStratum, manual})
    const mode = allocationMode({estimateSampleSize, manual})

    // A configured minimum below the statistical floor is itself invalid, and only meaningful for the
    // strategies that expose the field.
    // Automatic allocation must supply a valid minimum. A missing one is rejected rather than coerced, so the
    // recipe states the contract it was built with.
    if (usesConfiguredMinSamplesPerStratum({allocationStrategy, manual}) && !isValidMinSamplesPerStratum(minSamplesPerStratum)) {
        return clientException('invalidMinimum',
            'Minimum samples per stratum is {value}. It must be a whole number of at least {floor}.',
            {value: minSamplesPerStratum == null || minSamplesPerStratum === '' ? 'not set' : minSamplesPerStratum,
                floor: MIN_SAMPLES_PER_STRATUM})
    }

    if (!allocation.length) {
        return clientException('noStrata',
            'The sampling design has no strata to sample. Open Stratification and Sample Allocation to define the design.',
            {})
    }

    // The hard two-sample floor, per included stratum. An unstratified design is a single synthetic stratum,
    // so this is its total sample size.
    const belowFloor = allocation.filter(({sampleSize}) => !isValidStratumSampleSize(sampleSize))
    if (belowFloor.length) {
        if (unstratified) {
            return clientException('unstratifiedBelowMinimum',
                'The total sample size is {value}. An unstratified design needs at least {floor} samples. In Sample Allocation, increase Total sample size.',
                {value: belowFloor[0].sampleSize, floor: MIN_SAMPLES_PER_STRATUM})
        }
        const messages = {
            samples: 'Every stratum must be allocated at least {floor} samples, but {strata} requests fewer. In Sample Allocation, increase Total sample size until every affected stratum reaches at least {floor}.',
            error: 'Every stratum must be allocated at least {floor} samples, but {strata} requests fewer. In Sample Allocation, decrease Target margin of error to calculate a larger total sample size.',
            manual: 'Every stratum must be allocated at least {floor} samples, but {strata} requests fewer. In Sample Allocation, increase the sample count for each affected stratum to at least {floor}.'
        }
        return clientException(`belowStatisticalMinimum.${mode}`, messages[mode],
            {floor: MIN_SAMPLES_PER_STRATUM, strata: belowFloor.map(describe).join('; ')})
    }

    // Automatic allocations must also satisfy their own configured minimum.
    const belowConfigured = allocation.filter(({sampleSize}) => Number(sampleSize) < effectiveMinimum)
    if (belowConfigured.length) {
        const messages = {
            samples: 'Min samples/stratum is {minimum}, but {strata} requests fewer. In Sample Allocation, increase Total sample size, or lower Min samples/stratum to {value} or less (never below {floor}).',
            error: 'Min samples/stratum is {minimum}, but {strata} requests fewer. In Sample Allocation, decrease Target margin of error to calculate a larger total sample size, or lower Min samples/stratum to {value} or less (never below {floor}).'
        }
        return clientException(`belowConfiguredMinimum.${mode}`, messages[mode],
            {
                minimum: effectiveMinimum,
                strata: belowConfigured.map(describe).join('; '),
                value: Math.min(...belowConfigured.map(({sampleSize}) => Number(sampleSize))),
                floor: MIN_SAMPLES_PER_STRATUM
            })
    }

    return null
}
