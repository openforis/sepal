import {MIN_SAMPLES_PER_STRATUM} from '#sepal/recipe/samplingDesign/minSamples'

import {FINAL_COUNT_KIND} from './finalCountValidation.js'
import {minLatticeExponent, unstratifiedMinExponent} from './systematicLatticeMath.js'

const SQRT3 = Math.sqrt(3)
const KEY = 'tasks.samplingDesign.underproduction'

const round = value => Math.round(value * 10) / 10
const item = (key, message, args = {}) => ({key: `${KEY}.${key}`, message, args})
const name = ({label, stratum}) => label || `stratum ${stratum}`

// Each class is listed with its own count, so a multi-class failure connects class to number:
// "snow (0); water (1)".
const withCount = strata => strata.map(s => `${name(s)} (${s.actual})`).join('; ')
const withRequested = strata => strata.map(s => `${name(s)} (${s.actual} of ${s.requested})`).join('; ')

// ----------------------------------------------------------------------------------------------------------
// Spacing analysis: what the CONFIGURED grid actually permits, so advice never suggests a no-op.
// ----------------------------------------------------------------------------------------------------------

// The largest minimum distance that still permits the next denser grid, or null when the current spacing is
// already at the floor set by the stratification grid (stratified) or unconstrained (analytical unstratified).
export const nextDenserMinDistance = ({minDistance, pixelSize, unstratified}) => {
    const current = unstratified
        ? unstratifiedMinExponent({minDistance})
        : minLatticeExponent({minDistance, scale: pixelSize})
    const floor = unstratified
        ? unstratifiedMinExponent({minDistance: 0})
        : minLatticeExponent({minDistance: 0, scale: pixelSize})
    return current > floor ? SQRT3 * Math.pow(2, current - 1) : null
}

// The single spacing recommendation that applies to this configuration, or null when none can help. Minimum
// distance is a Systematic-only setting, so random sampling has no spacing advice.
export const spacingAction = ({arrangementStrategy, minDistance, pixelSize, unstratified}) => {
    if (arrangementStrategy === 'RANDOM') {
        return null
    }
    const distance = Number(minDistance) || 0
    const threshold = nextDenserMinDistance({minDistance: distance, pixelSize, unstratified})
    if (threshold !== null) {
        return item('reduceSystematicMinDistance',
            'Minimum distance is {minDistance} m. In Sample Arrangement, reduce it to about {threshold} m or less to fit more sample locations into the grid.',
            {minDistance: round(distance), threshold: round(threshold)})
    }
    if (unstratified) {
        return null
    }
    return item('atGridFloor',
        'Reducing minimum distance will not add more sample locations. The {pixelSize} m stratification grid already sets the closest spacing available.',
        {pixelSize: round(pixelSize)})
}

const reviseStratificationAction = () => item('reviseStratification',
    'Open Stratification and check that this class really occurs in the area of interest and has usable pixels there - it may have been excluded from sampling. If it only covers small scattered patches, combine it with a similar class, update the stratification, then recompute the areas and allocation.')

const enlargeOrMergeAction = () => item('enlargeOrMerge',
    'Enlarge the area of interest, or combine this class with a similar one so it covers more ground.')

const switchToRandomAction = () => item('switchToRandom',
    'In Sample Arrangement, set Arrangement to Random to place samples more freely.')

// Reducing the request helps whenever the requested count is what is unmet. Systematic sampling can also fall
// back to Closest; random sampling has no such strategy, so it gets its own action.
const reduceRequestedAction = ({arrangementStrategy, sampleSizeStrategy}) => {
    if (arrangementStrategy === 'RANDOM') {
        return item('reduceRequestedRandom',
            'In Sample Allocation, reduce the sample size for these classes.')
    }
    return sampleSizeStrategy === 'OVER' || sampleSizeStrategy === 'EXACT'
        ? item('reduceRequestedOrClosest',
            'In Sample Allocation, reduce the sample size, or in Sample Arrangement set Sample size strategy to Closest to accept the closest achievable count.')
        : null
}

const avoidEqualAllocationAction = ({allocationStrategy}) =>
    allocationStrategy === 'EQUAL'
        ? item('avoidEqualAllocation',
            'Equal allocation asks for the same number of samples from every class. In Sample Allocation, choose Proportional, Power, Optimal, or manual allocation to ask for fewer samples from rare classes.')
        : null

// ----------------------------------------------------------------------------------------------------------
// Per-kind diagnosis + recommendations. Diagnosis states what was observed; actions are composed separately so
// each reason reuses the applicable spacing/class advice without duplicating message blocks.
// ----------------------------------------------------------------------------------------------------------

const statisticalMinimumAdvice = (strata, config) => {
    const {arrangementStrategy} = config
    const systematic = arrangementStrategy !== 'RANDOM'
    const spacing = spacingAction(config)
    // Only claim the class itself is too rare once placement cannot explain the shortage. Random placement is
    // unconstrained, so for random the class really is too rare in the area of interest.
    const diagnosis = systematic
        ? item('diagnosis.statisticalMinimum',
            'Too few sample locations were found for {strata}. Every class needs at least {minimum} samples.',
            {strata: withCount(strata), minimum: MIN_SAMPLES_PER_STRATUM})
        : item('diagnosis.statisticalMinimumNoDistance',
            'Fewer than {minimum} sample locations could be placed for {strata} anywhere in the area of interest.',
            {strata: withCount(strata), minimum: MIN_SAMPLES_PER_STRATUM})
    return {
        diagnosis,
        actions: [
            spacing,
            systematic ? switchToRandomAction() : null,
            reviseStratificationAction(),
            enlargeOrMergeAction()
        ].filter(Boolean)
    }
}

const configuredMinimumAdvice = (strata, config) => {
    const {effectiveMinimum, sampleSizeStrategy, arrangementStrategy} = config
    const lowest = Math.min(...strata.map(({actual}) => actual))
    const requestedAlsoMissed = strata.some(({actual, requested}) => actual < requested)
        && (arrangementStrategy === 'RANDOM' || sampleSizeStrategy === 'OVER' || sampleSizeStrategy === 'EXACT')
    return {
        diagnosis: item('diagnosis.configuredMinimum',
            'Fewer samples than the minimum of {minimum} per class were produced for {strata}.',
            {strata: withCount(strata), minimum: effectiveMinimum}),
        actions: [
            item('lowerConfiguredMinimum',
                'In Sample Allocation, lower Minimum samples per stratum to {value} or less, but not below {floor}.',
                {value: lowest, floor: MIN_SAMPLES_PER_STRATUM}),
            requestedAlsoMissed
                ? item('minimumNotSufficient',
                    'Lowering the minimum on its own is not enough here, because the requested sample size was not reached either.')
                : null,
            spacingAction(config)
        ].filter(Boolean)
    }
}

const requestedAllocationAdvice = (strata, config) => {
    const {effectiveMinimum} = config
    return {
        diagnosis: item('diagnosis.requestedAllocation',
            'Fewer samples than requested were produced for {strata}. The minimum of {minimum} per class was met.',
            {strata: withRequested(strata), minimum: effectiveMinimum}),
        actions: [
            reduceRequestedAction(config),
            avoidEqualAllocationAction(config),
            spacingAction(config)
        ].filter(Boolean)
    }
}

const ADVICE_BY_KIND = {
    [FINAL_COUNT_KIND.statisticalMinimum]: statisticalMinimumAdvice,
    [FINAL_COUNT_KIND.configuredMinimum]: configuredMinimumAdvice,
    [FINAL_COUNT_KIND.requestedAllocation]: requestedAllocationAdvice
}

// Structured advice per failure group: diagnosis and recommendations stay separate, each carrying its own
// translation key and arguments, so a renderer can localize every sentence.
export const underproductionAdvice = ({groups, config}) =>
    groups.map(({kind, strata}) => ({kind, strata, ...ADVICE_BY_KIND[kind](strata, config)}))

const interpolate = ({message, args}) =>
    message.replace(/{(\w+)}/g, (match, key) => key in args ? String(args[key]) : match)

// English rendering, used as the fallback when a localized renderer isn't available.
export const renderAdvice = advice =>
    advice
        .map(({diagnosis, actions}) => [interpolate(diagnosis), ...actions.map(interpolate)].join(' '))
        .join('\n\n')

// The structured ClientException payload. `advice` travels inside args so it survives to the renderer, which
// can translate each entry by key; `details` is the English fallback for that same content.
export const underproductionUserMessage = ({groups, config}) => {
    const advice = underproductionAdvice({groups, config})
    return {
        key: `${KEY}.message`,
        message: 'The sampling design could not be produced as configured. {details}',
        args: {details: renderAdvice(advice), advice}
    }
}
