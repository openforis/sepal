import {effectiveMinSamplesPerStratum} from '#sepal/recipe/samplingDesign/minSamples'

import {allocate} from './allocate'
import {calculateBounds} from './confidenceInterval'
import {allocationStrata, byStratumKey, hasProportions, stratumKey, toCountRow, toCountRows} from './designModel'
import {boundsToMarginOfError, calculateMarginOfError} from './marginOfError'
import {calculateSampleSize} from './sampleSize'

export const isPositiveIntegerSampleSize = value =>
    value != null && value !== '' && /^[1-9]\d*$/.test(String(value))

export const isManualAllocation = model => !!model?.sampleAllocation?.manual?.length

// The whole automatic outcome - counts, the total the counts add up to, and the derived uncertainty - as one
// pure function over the persisted model. The Allocation panel and the semantic planner both go through it,
// so an allocation recomputed with the panel closed is the same allocation the panel would have produced.
export const allocationOutcome = model => {
    const {
        estimateSampleSize, sampleSize, marginOfError, confidenceLevel,
        allocationStrategy, minSamplesPerStratum, powerTuningConstant
    } = model?.sampleAllocation || {}
    const strata = allocationStrata(model)
    const withProportions = hasProportions(model)
    const minSamples = effectiveMinSamplesPerStratum({allocationStrategy, minSamplesPerStratum})
    const tuningConstant = parseFloat(powerTuningConstant)
    const confidence = parseFloat(confidenceLevel) / 100
    const countsFor = size => toCountRows(allocate({
        sampleSize: parseInt(size),
        strategy: allocationStrategy,
        minSamplesPerStratum: minSamples,
        strata,
        tuningConstant
    }))

    if (estimateSampleSize && withProportions) {
        const solved = calculateSampleSize({
            // The panel percentage is a relative margin; the solver takes it as a fraction (10% -> 0.10).
            marginOfError: parseFloat(marginOfError) / 100,
            strategy: allocationStrategy,
            minSamplesPerStratum: minSamples,
            strata,
            tuningConstant,
            confidenceLevel: confidence
        })
        return {allocation: countsFor(solved), sampleSize: solved}
    }
    if (!isPositiveIntegerSampleSize(sampleSize)) {
        return {allocation: strata.map(({stratum}) => ({stratum})), marginOfError: null}
    }
    // Too small to give every stratum its minimum: surface non-finite counts rather than silently allocating
    // below the floor, so the panel's own validation rejects it.
    if (Number(sampleSize) < minSamples * strata.length) {
        return {allocation: strata.map(({stratum}) => ({stratum, sampleSize: NaN})), marginOfError: null}
    }
    if (withProportions) {
        const calculated = calculateMarginOfError({
            sampleSize: parseInt(sampleSize),
            confidenceLevel: confidence,
            strategy: allocationStrategy,
            minSamplesPerStratum: minSamples,
            strata,
            tuningConstant
        })
        // Relative margin shown as a percentage.
        return {allocation: countsFor(sampleSize), marginOfError: calculated * 100}
    }
    return {allocation: countsFor(sampleSize), marginOfError: null}
}

// Keyed, order-independent reconciliation: an answered count follows its stratum wherever it moves, a
// vanished stratum leaves, and a new one arrives with no count at all rather than an invented zero.
export const reconcileManualAllocation = ({allocation, stratumKeys}) => {
    const existing = byStratumKey(allocation)
    return stratumKeys.map(key => toCountRow({...existing.get(key), stratum: key}))
}

export const unansweredStrata = allocation =>
    (allocation || []).filter(({sampleSize}) => sampleSize == null || sampleSize === '').map(stratumKey)

// Derived uncertainty for counts that are already correct - the case where proportions moved but the counts
// they produced did not. Null without proportions: there is no overall proportion to be relative to.
export const marginOfErrorFor = model => {
    if (!hasProportions(model)) {
        return null
    }
    const strata = byStratumKey(allocationStrata(model))
    const rows = (model?.sampleAllocation?.allocation || []).map(row => {
        const joined = strata.get(stratumKey(row))
        return {weight: joined?.weight, proportion: joined?.proportion, sampleSize: parseInt(row.sampleSize)}
    })
    const confidenceLevel = parseFloat(model?.sampleAllocation?.confidenceLevel) / 100
    return boundsToMarginOfError({bounds: calculateBounds({confidenceLevel, allocation: rows})}) * 100
}
