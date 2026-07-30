import {isManualAllocation, MIN_SAMPLES_PER_STRATUM} from '#sepal/recipe/samplingDesign/minSamples'

import {FINAL_COUNT_KIND} from './finalCountValidation.js'
import {minLatticeExponent, unstratifiedMinExponent} from './systematicLatticeMath.js'

const SQRT3 = Math.sqrt(3)
const KEY = 'tasks.samplingDesign.underproduction'

const round = value => Math.round(value * 10) / 10
const item = (key, message, args = {}) => ({key: `${KEY}.${key}`, message, args})
const name = ({label, stratum}) => label || `stratum ${stratum}`

const withCount = strata => strata.map(s => `${name(s)} (${s.actual})`).join('; ')
const withRequested = strata => strata.map(s => `${name(s)} (${s.actual} of ${s.requested})`).join('; ')

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

// The single spacing recommendation that applies, or null when none can help (random has no spacing advice).
export const spacingAction = ({arrangementStrategy, minDistance, pixelSize, unstratified}) => {
    if (arrangementStrategy === 'RANDOM') {
        return null
    }
    const distance = Number(minDistance) || 0
    const threshold = nextDenserMinDistance({minDistance: distance, pixelSize, unstratified})
    if (threshold !== null) {
        return item('reduceSystematicMinDistance',
            'In Sample Arrangement, reduce Minimum distance from {minDistance} m to about {threshold} m or less.',
            {minDistance: round(distance), threshold: round(threshold)})
    }
    if (unstratified) {
        return null
    }
    return item('atGridFloor',
        'The current {pixelSize} m stratification grid already sets the minimum spacing.',
        {pixelSize: round(pixelSize)})
}

// An unstratified design has one synthetic stratum, so it is only told to enlarge the AOI, never to revise,
// merge or recompute a stratification.
const coverageAction = ({unstratified}) =>
    unstratified
        ? item('enlargeAoi',
            'If the area of interest is smaller than the intended study area, enlarge it to provide more eligible locations.')
        : item('checkStratumCoverage',
            'In Stratification, check that each affected stratum has usable, unmasked pixels in the area of interest. Merge or reclassify very small or fragmented strata, then recalculate areas and allocation.')

// A finer Scale can add eligible cells, but only for a stratified design (an unstratified design has no
// stratification grid to refine).
const reduceScaleAction = ({unstratified}) =>
    unstratified
        ? null
        : item('reduceStratificationScale',
            'In Stratification, use a finer Scale only if the source supports it, then recalculate areas and allocation.')

const switchToRandomAction = () => item('switchToRandom',
    'In Sample Arrangement, change Arrangement strategy to Random. This removes systematic spacing without changing the eligible area.')

// Spacing advice that can actually add locations (a denser grid is available), never the informational
// "already at the grid floor" note. Used where a spacing action must not displace an action that can actually
// resolve a shortfall.
const reducibleSpacingAction = config => {
    const spacing = spacingAction(config)
    return spacing && spacing.key.endsWith('.reduceSystematicMinDistance') ? spacing : null
}

const capacityAction = config =>
    config.arrangementStrategy === 'RANDOM'
        ? reduceScaleAction(config)
        : reducibleSpacingAction(config)

// Samples mode reduces the fixed count; Error mode raises the target margin of error to calculate a smaller
// one. Systematic OVER/EXACT can additionally fall back to Closest; random never mentions Closest.
const reduceRequestedAction = ({arrangementStrategy, sampleSizeStrategy, estimateSampleSize}) => {
    const canUseClosest = arrangementStrategy !== 'RANDOM'
        && (sampleSizeStrategy === 'OVER' || sampleSizeStrategy === 'EXACT')
    if (estimateSampleSize) {
        return canUseClosest
            ? item('increaseMarginOfErrorOrClosest',
                'In Sample Allocation, increase Target margin of error, or in Sample Arrangement choose Closest.')
            : item('increaseMarginOfError',
                'In Sample Allocation, increase Target margin of error.')
    }
    return canUseClosest
        ? item('reduceRequestedOrClosest',
            'In Sample Allocation, reduce Total sample size, or in Sample Arrangement choose Closest.')
        : item('reduceRequested',
            'In Sample Allocation, reduce Total sample size.')
}

// Only the strategies that work WITHOUT anticipated proportions are recommended, since this advice does not
// know whether proportions are available. Never suggested for an unstratified (single-stratum) design.
const avoidEqualAllocationAction = ({allocationStrategy, unstratified}) =>
    !unstratified && allocationStrategy === 'EQUAL'
        ? item('avoidEqualAllocation',
            'In Sample Allocation, replace Equal with Proportional, Balanced, or Manual to reduce counts for small strata.')
        : null

const statisticalMinimumAdvice = (strata, config) => {
    const {arrangementStrategy} = config
    const systematic = arrangementStrategy !== 'RANDOM'
    const spacing = spacingAction(config)
    const diagnosis = systematic
        ? item('diagnosis.statisticalMinimum',
            '{strata}: fewer than {minimum} sample locations were found.',
            {strata: withCount(strata), minimum: MIN_SAMPLES_PER_STRATUM})
        : item('diagnosis.statisticalMinimumNoDistance',
            '{strata}: fewer than {minimum} sample locations were found at the current sampling grid.',
            {strata: withCount(strata), minimum: MIN_SAMPLES_PER_STRATUM})
    // At most three prioritized actions. Systematic: adjust spacing, then place more freely, then fix coverage.
    // Random draws at the grid, so instead of spacing it can sample at a finer stratification scale.
    return {
        diagnosis,
        actions: [
            spacing,
            systematic ? switchToRandomAction() : reduceScaleAction(config),
            coverageAction(config)
        ].filter(Boolean)
    }
}

const configuredMinimumAdvice = (strata, config) => {
    const {effectiveMinimum, sampleSizeStrategy, arrangementStrategy} = config
    const lowest = Math.min(...strata.map(({actual}) => actual))
    const requestedAlsoMissed = strata.some(({actual, requested}) => actual < requested)
        && (arrangementStrategy === 'RANDOM' || sampleSizeStrategy === 'OVER' || sampleSizeStrategy === 'EXACT')
    // Priority: lower the configured minimum, then resolve any remaining count shortfall (mode-aware), then a
    // spacing reduction only when it can actually add locations. reducibleSpacingAction excludes the
    // "at grid floor" note, so a spacing message can never displace the shortfall action under the three cap.
    return {
        diagnosis: item('diagnosis.configuredMinimum',
            '{strata}: fewer than Min samples/stratum ({minimum}) were produced.',
            {strata: withCount(strata), minimum: effectiveMinimum}),
        actions: [
            item('lowerConfiguredMinimum',
                'In Sample Allocation, lower Min samples/stratum to {value} or less, but not below {floor}.',
                {value: lowest, floor: MIN_SAMPLES_PER_STRATUM}),
            requestedAlsoMissed ? reduceRequestedAction(config) : null,
            capacityAction(config)
        ].filter(Boolean)
    }
}

const requestedAllocationAdvice = (strata, config) => {
    const {estimateSampleSize} = config
    const diagnosis = estimateSampleSize
        ? item('diagnosis.calculatedAllocation',
            '{strata}: fewer locations than calculated were produced.',
            {strata: withRequested(strata)})
        : item('diagnosis.requestedAllocation',
            '{strata}: fewer locations than requested were produced.',
            {strata: withRequested(strata)})
    return {
        diagnosis,
        actions: [
            reduceRequestedAction(config),
            avoidEqualAllocationAction(config),
            capacityAction(config)
        ].filter(Boolean)
    }
}

const ADVICE_BY_KIND = {
    [FINAL_COUNT_KIND.statisticalMinimum]: statisticalMinimumAdvice,
    [FINAL_COUNT_KIND.configuredMinimum]: configuredMinimumAdvice,
    [FINAL_COUNT_KIND.requestedAllocation]: requestedAllocationAdvice
}

// Normalize the raw config to the ACTIVE advice configuration once, so a stale saved value cannot drive
// advice: Manual allocation overrides the Samples/Error toggle and the allocation strategy (the user set the
// counts directly), so a stale estimateSampleSize or EQUAL saved behind Manual yields neither Target
// margin-of-error advice nor Equal-allocation advice.
const activeConfig = config => {
    const manual = isManualAllocation(config.manual)
    return {
        ...config,
        estimateSampleSize: manual ? false : !!config.estimateSampleSize,
        allocationStrategy: manual ? 'MANUAL' : config.allocationStrategy
    }
}

// Structured advice per failure group: diagnosis and recommendations stay separate, each carrying its own
// translation key and arguments, so a renderer can localize every sentence.
export const underproductionAdvice = ({groups, config}) => {
    const active = activeConfig(config)
    return groups.map(({kind, strata}) => ({kind, strata, ...ADVICE_BY_KIND[kind](strata, active)}))
}

const interpolate = ({message, args}) =>
    message.replace(/{(\w+)}/g, (match, key) => key in args ? String(args[key]) : match)

// English rendering, used as the fallback when a localized renderer isn't available.
export const renderAdvice = advice =>
    advice
        .map(({diagnosis, actions}) =>
            [interpolate(diagnosis), ...actions.map(action => `- ${interpolate(action)}`)].join('\n'))
        .join('\n\n')

// The structured ClientException payload. `advice` travels inside args so it survives to the renderer, which
// can translate each entry by key; `details` is the English fallback for that same content.
export const underproductionUserMessage = ({groups, config}) => {
    const advice = underproductionAdvice({groups, config})
    return {
        key: `${KEY}.message`,
        message: 'The sampling design could not be completed.\n\n{details}',
        args: {details: renderAdvice(advice), advice}
    }
}
