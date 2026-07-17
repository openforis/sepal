import {isStratificationSkipped} from '#sepal/ee/samplingDesign/stratificationSkip'
import {ClientException} from '#sepal/exception'
import {
    effectiveMinSamplesPerStratum,
    isValidMinSamplesPerStratum,
    isValidStratumSampleSize,
    MIN_SAMPLES_PER_STRATUM,
    usesConfiguredMinSamplesPerStratum
} from '#sepal/recipe/samplingDesign/minSamples'

// Recipe-level guard for the minimum-sample contract, run BEFORE any temp asset id is resolved or any EE graph
// is built. A recipe that cannot possibly satisfy the floor is rejected up front rather than after an expensive
// export. Returns a structured ClientException, or null when the recipe is admissible.

const KEY = 'tasks.samplingDesign.preflight'

const interpolate = (message, args) =>
    message.replace(/{(\w+)}/g, (match, name) => name in args ? String(args[name]) : match)

const clientException = (key, message, args) =>
    new ClientException(interpolate(message, args), {userMessage: {key: `${KEY}.${key}`, message, args}})

const describe = ({label, stratum, sampleSize}) => `${label || `stratum ${stratum}`} (${sampleSize})`

export const samplingDesignPreflightError = recipe => {
    const {model: {stratification, sampleAllocation}} = recipe
    const {allocation = [], minSamplesPerStratum, allocationStrategy, manual} = sampleAllocation || {}
    const unstratified = isStratificationSkipped(stratification)
    const effectiveMinimum = effectiveMinSamplesPerStratum({allocationStrategy, minSamplesPerStratum, manual})

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

    // The hard statistical floor, per included stratum. An unstratified design is a single synthetic stratum,
    // so this is its total sample size.
    const belowFloor = allocation.filter(({sampleSize}) => !isValidStratumSampleSize(sampleSize))
    if (belowFloor.length) {
        return unstratified
            ? clientException('unstratifiedBelowMinimum',
                'The total sample size is {value}. An unstratified design needs at least {floor} samples.',
                {value: belowFloor[0].sampleSize, floor: MIN_SAMPLES_PER_STRATUM})
            : clientException('belowStatisticalMinimum',
                'Every stratum needs at least {floor} samples, but {strata} requests fewer. Increase the sample size, or merge these strata in Stratification.',
                {floor: MIN_SAMPLES_PER_STRATUM, strata: belowFloor.map(describe).join('; ')})
    }

    // Automatic allocations must also satisfy their own configured minimum.
    const belowConfigured = allocation.filter(({sampleSize}) => Number(sampleSize) < effectiveMinimum)
    if (belowConfigured.length) {
        return clientException('belowConfiguredMinimum',
            'Minimum samples per stratum is {minimum}, but {strata} requests fewer. Increase the sample size, or lower the minimum to {value} or less (never below {floor}).',
            {
                minimum: effectiveMinimum,
                strata: belowConfigured.map(describe).join('; '),
                value: Math.min(...belowConfigured.map(({sampleSize}) => Number(sampleSize))),
                floor: MIN_SAMPLES_PER_STRATUM
            })
    }

    return null
}
