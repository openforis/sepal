import _ from 'lodash'

import {allocationReviewInputs} from '#sepal/recipe/samplingDesign/allocationReview'
import {isAllocationStrategy, readsProportions} from '#sepal/recipe/samplingDesign/allocationStrategy'
import {effectiveMinSamplesPerStratum, isManualAllocation as isManual} from '#sepal/recipe/samplingDesign/minSamples'

import {allocate} from './allocate'
import {calculateBounds} from './confidenceInterval'
import {allocationStrata, byStratumKey, hasProportions, orderedStratumKeys, stratumKey, toCountRow, toCountRows} from './designModel'
import {boundsToMarginOfError, calculateMarginOfError} from './marginOfError'
import {calculateSampleSize} from './sampleSize'

export const isPositiveIntegerSampleSize = value =>
    value != null && value !== '' && /^[1-9]\d*$/.test(String(value))

// Saved as the form's toggle or as the boolean flag of older recipes alike.
export const isManualAllocation = model => isManual(model?.sampleAllocation?.manual)

// The strata as count rows carrying no counts. Enough for the panel to show which strata exist, while a row
// with no count still reads as unanswered - it is not an allocation.
export const blankAllocation = model =>
    allocationStrata(model).map(({stratum}) => ({stratum}))

// The allocation a design derives as its Allocation panel shows it (derivations.js): manual counts kept by stratum, with
// the uncertainty they imply, or the automatic outcome - and the record of the inputs it was derived from, which it is
// reviewed by (#sepal/recipe/samplingDesign/allocationReview), dropping the flag of an older client that record replaces.
export const derivedAllocation = model => {
    const outcome = isManualAllocation(model) ? manualOutcome(model) : allocationOutcome(model)
    const derived = {...model, sampleAllocation: {...model.sampleAllocation, ...outcome}}
    return {
        ...outcome,
        reviewedInputs: allocationReviewInputs(derived),
        ...(model.sampleAllocation?.requiresUpdate !== undefined && {requiresUpdate: undefined})
    }
}

// The whole automatic outcome - counts, the total the counts add up to, and the derived uncertainty - as one
// pure function over a design.
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
        return {allocation: blankAllocation(model), marginOfError: null}
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

// The strategy a design should actually run with. A saved choice is the user's - opening a panel or
// replanning is not consent to change it - so it is kept whenever the allocator can run it. Anything else,
// including a name nobody recognizes and a field that was never saved, falls back to the default a new
// recipe starts with, which the caller supplies.
//
// `proportionsApplicable`, deliberately, rather than whether proportion rows exist yet: a variance strategy
// belongs to a design that uses proportions, and rows that are pending, stale or momentarily empty are a
// lifecycle state, not a reason to change what the user chose.
export const effectiveAllocationStrategy = ({allocationStrategy, proportionsApplicable, defaultStrategy}) =>
    isAllocationStrategy(allocationStrategy)
        && (proportionsApplicable || !readsProportions(allocationStrategy))
        ? allocationStrategy
        : defaultStrategy

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

// Manual counts are the user's and are never recalculated: rows follow the strata as they are now, by stratum, and the
// uncertainty they imply is derived from them. Rows already the strata's are kept as they are being edited.
const manualOutcome = model => {
    const rows = model?.sampleAllocation?.allocation
    const stratumKeys = orderedStratumKeys(model)
    const allocation = _.isEqual(rows?.map(stratumKey), stratumKeys) ? rows : reconcileManualAllocation({allocation: rows, stratumKeys})
    return {allocation, marginOfError: marginOfErrorFor({...model, sampleAllocation: {...model.sampleAllocation, allocation}})}
}
