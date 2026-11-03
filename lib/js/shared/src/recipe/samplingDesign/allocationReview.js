import _ from 'lodash'

import {readsWeights} from './allocationStrategy.js'
import {effectiveMinSamplesPerStratum, isManualAllocation} from './minSamples.js'
import {isProportionsApplicable} from './proportionsSkip.js'

// Whether a design's sample allocation was reviewed for the inputs it reads now, judged alike by the GUI - the
// Allocation panel, the toolbar and Retrieve - and by a task's admission. An allocation is a set of numbers a person is
// expected to look at: the counts, the total they add up to and the uncertainty shown with them. Apply saves beside them
// the inputs they were derived from as the panel showed them (`reviewedInputs`), and the allocation stands reviewed
// while those are the design's inputs now - whatever was edited, and changed back, in between.
//
// The inputs are canonical ordinary values, so a JSON round trip, and the allocation rows a task is submitted with,
// compare equal: the strata in order - remainder adjustment walks them in order - their weights and proportions wherever
// the counts or the uncertainty read them, the effective settings and the active target, and manual counts wherever they
// determine the uncertainty. Labels, colours, source revisions and evidence are not inputs.
//
// A client of the previous release wrote `requiresUpdate` on every allocation it touched - false as its panel applied
// one, true as its planner flagged one - and kept whatever else the section held, `reviewedInputs` included, while it
// replaced the counts. Where the flag is saved, false included, the record is not taken as the allocation's.

export const REVIEWED = 'REVIEWED'
// No record: saved before allocations recorded what they were reviewed for.
export const UNREVIEWED = 'UNREVIEWED'
// A record a client of the previous release may have kept beside counts it replaced.
export const UNTRUSTED = 'UNTRUSTED'
export const INPUTS_CHANGED = 'INPUTS_CHANGED'

const LEGACY_FLAG = 'requiresUpdate'

export const allocationReviewState = model => {
    const allocation = model?.sampleAllocation || {}
    if (allocation[LEGACY_FLAG] !== undefined) {
        return UNTRUSTED
    }
    if (allocation.reviewedInputs == null) {
        return UNREVIEWED
    }
    return _.isEqual(allocation.reviewedInputs, allocationReviewInputs(model)) ? REVIEWED : INPUTS_CHANGED
}

// What the allocation of a design reads, as the review records it. Every key is present, null where it is not read.
export const allocationReviewInputs = model => {
    const sampleAllocation = model?.sampleAllocation || {}
    const strata = model?.stratification?.strata || []
    const manual = isManualAllocation(sampleAllocation.manual)
    const strategy = manual ? null : sampleAllocation.allocationStrategy ?? null
    const withProportions = hasProportions(model)
    const estimating = !manual && Boolean(sampleAllocation.estimateSampleSize) && withProportions
    const proportions = byStratum(model?.proportions?.anticipatedProportions)
    const counts = byStratum(sampleAllocation.allocation)
    return {
        strata: strata.map(stratumOf),
        manual,
        weights: withProportions || readsWeights(strategy) ? strata.map(({weight}) => numberOrNull(weight)) : null,
        proportions: withProportions ? strata.map(stratum => numberOrNull(proportions.get(stratumOf(stratum))?.proportion)) : null,
        counts: manual && withProportions ? strata.map(stratum => numberOrNull(counts.get(stratumOf(stratum))?.sampleSize)) : null,
        allocationStrategy: strategy,
        minSamplesPerStratum: manual ? null : effectiveMinSamplesPerStratum(sampleAllocation),
        powerTuningConstant: strategy === 'POWER' ? numberOrNull(sampleAllocation.powerTuningConstant) : null,
        confidenceLevel: withProportions ? numberOrNull(sampleAllocation.confidenceLevel) : null,
        sampleSize: manual || estimating ? null : numberOrNull(sampleAllocation.sampleSize),
        marginOfError: estimating ? numberOrNull(sampleAllocation.marginOfError) : null
    }
}

// Proportions not skipped, with rows to read: what the uncertainty and the variance strategies are calculated from.
const hasProportions = model => isProportionsApplicable(model) && Boolean(model?.proportions?.anticipatedProportions?.length)

const byStratum = rows => new Map((rows || []).map(row => [stratumOf(row), row]))

const stratumOf = row => Number(row?.stratum ?? row?.value)

const numberOrNull = value => {
    if (value === null || value === undefined || value === '') {
        return null
    }
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}
