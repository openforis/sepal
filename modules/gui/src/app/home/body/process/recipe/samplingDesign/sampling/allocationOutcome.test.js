import _ from 'lodash'
import {describe, expect, it} from 'vitest'

import {
    allocationOutcome,
    effectiveAllocationStrategy,
    effectiveSampleAllocation,
    marginOfErrorFor,
    reconcileManualAllocation} from './allocationOutcome'
import {getDefaultSampleAllocation} from './defaultModel'

// The whole automatic outcome - counts, the total they add up to, and the derived uncertainty - as one pure
// function over a design. This is where the arithmetic is specified: the Allocation panel is its only caller,
// and what it produces is what that panel shows and applies.

const STRATA = [
    {value: 1, label: 'Forest', color: '#0a0', area: 300, weight: 0.3},
    {value: 2, label: 'Non-forest', color: '#a00', area: 700, weight: 0.7}
]
const SHIFTED_WEIGHTS = [
    {value: 1, label: 'Forest', color: '#0a0', area: 500, weight: 0.5},
    {value: 2, label: 'Non-forest', color: '#a00', area: 500, weight: 0.5}
]
const PROPORTIONS = [{stratum: 1, proportion: 0.4}, {stratum: 2, proportion: 0.1}]
const CHANGED_PROPORTIONS = [{stratum: 1, proportion: 0.9}, {stratum: 2, proportion: 0.05}]

const design = ({strata = STRATA, anticipatedProportions = PROPORTIONS, skip = false, ...sampleAllocation} = {}) => ({
    stratification: {strata},
    proportions: {skip, anticipatedProportions},
    sampleAllocation: {
        manual: [],
        estimateSampleSize: false,
        sampleSize: 100,
        confidenceLevel: 95,
        allocationStrategy: 'PROPORTIONAL',
        minSamplesPerStratum: '2',
        powerTuningConstant: '0.5',
        allocation: [{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}],
        ...sampleAllocation
    }
})

describe('allocationOutcome - a fixed total sample size', () => {
    it('spreads a Proportional allocation by weight', () => {
        expect(allocationOutcome(design()).allocation)
            .toEqual([{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}])
        expect(allocationOutcome(design({strata: SHIFTED_WEIGHTS})).allocation)
            .toEqual([{stratum: 1, sampleSize: 50}, {stratum: 2, sampleSize: 50}])
    })

    // Count rows own the stratum and its count, nothing else: presentation and weight are joined from the
    // stratification when the table renders, so a copy here could only go stale.
    it('produces count-only rows, never a joined copy of the strata', () => {
        allocationOutcome(design()).allocation
            .forEach(row => expect(Object.keys(row).sort()).toEqual(['sampleSize', 'stratum']))
    })

    // Derived independently, not recorded: Optimal is Power with a tuning constant of 1, so the weight for
    // stratum k is cv_k * (w_k * p_k). With p = [0.9, 0.05] and w = [0.3, 0.7] those are (0.3/0.9)*0.27 = 0.09
    // and (sqrt(0.0475)/0.05)*0.035 = 0.15256, giving 37 and 63 of 100.
    it('spreads an Optimal allocation by weight and anticipated proportion', () => {
        expect(allocationOutcome(design({allocationStrategy: 'OPTIMAL', anticipatedProportions: CHANGED_PROPORTIONS}))
            .allocation).toEqual([{stratum: 1, sampleSize: 37}, {stratum: 2, sampleSize: 63}])
    })

    it('derives a relative margin of error from the counts', () => {
        expect(Number.isFinite(allocationOutcome(design()).marginOfError)).toBe(true)
    })

    // No overall proportion to be relative to, so there is no margin to display.
    it('has no margin without proportions', () => {
        expect(allocationOutcome(design({skip: true})).marginOfError).toBeNull()
    })

    it('blanks the counts when there is no usable total', () => {
        const {allocation, marginOfError} = allocationOutcome(design({sampleSize: null}))
        expect(allocation).toEqual([{stratum: 1}, {stratum: 2}])
        expect(marginOfError).toBeNull()
    })

    // Surfaced rather than silently allocated below the floor, so the panel's own validation rejects it.
    it('reports non-finite counts when the total cannot give every stratum its minimum', () => {
        expect(allocationOutcome(design({sampleSize: 3, minSamplesPerStratum: '2'})).allocation)
            .toEqual([{stratum: 1, sampleSize: NaN}, {stratum: 2, sampleSize: NaN}])
    })
})

describe('allocationOutcome - error mode', () => {
    const errorMode = overrides => design({estimateSampleSize: true, marginOfError: 50, ...overrides})

    it('solves a total sample size the counts add up to', () => {
        const {allocation, sampleSize} = allocationOutcome(errorMode())
        expect(Number.isFinite(sampleSize)).toBe(true)
        expect(_.sumBy(allocation, 'sampleSize')).toBe(sampleSize)
    })

    it('solves a different total when the anticipated proportions move', () => {
        expect(allocationOutcome(errorMode()).sampleSize)
            .not.toBe(allocationOutcome(errorMode({anticipatedProportions: CHANGED_PROPORTIONS})).sampleSize)
    })
})

// The uncertainty a set of counts implies, for counts that are already correct - the case where weights or
// proportions moved but the counts they produced did not.
describe('marginOfErrorFor', () => {
    it('is derived from the counts, the weights and the proportions', () => {
        expect(Number.isFinite(marginOfErrorFor(design()))).toBe(true)
    })

    it('moves when the weights move', () => {
        expect(marginOfErrorFor(design())).not.toBe(marginOfErrorFor(design({strata: SHIFTED_WEIGHTS})))
    })

    it('moves when the proportions move', () => {
        expect(marginOfErrorFor(design())).not.toBe(marginOfErrorFor(design({anticipatedProportions: CHANGED_PROPORTIONS})))
    })

    it('is null without proportions', () => {
        expect(marginOfErrorFor(design({skip: true}))).toBeNull()
    })
})

// Keyed, order-independent: an answered count follows its stratum wherever it moves, a vanished stratum
// leaves, and a new one arrives with no count at all rather than an invented zero.
describe('reconcileManualAllocation', () => {
    const allocation = [{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}]

    it('keeps answered counts and leaves a new stratum unanswered', () => {
        expect(reconcileManualAllocation({allocation, stratumKeys: [1, 2, 3]}))
            .toEqual([{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}, {stratum: 3}])
    })

    it('drops a stratum that no longer exists', () => {
        expect(reconcileManualAllocation({allocation, stratumKeys: [1]}))
            .toEqual([{stratum: 1, sampleSize: 30}])
    })

    // A positional pass would slide stratum 2's count onto stratum 3.
    it('matches by key rather than by position when the first stratum is dropped', () => {
        expect(reconcileManualAllocation({
            allocation: [{stratum: 1, sampleSize: 10}, {stratum: 2, sampleSize: 20}, {stratum: 3, sampleSize: 30}],
            stratumKeys: [2, 3]
        })).toEqual([{stratum: 2, sampleSize: 20}, {stratum: 3, sampleSize: 30}])
    })

    it('follows a reordering without moving a count', () => {
        expect(reconcileManualAllocation({allocation, stratumKeys: [2, 1]}))
            .toEqual([{stratum: 2, sampleSize: 70}, {stratum: 1, sampleSize: 30}])
    })
})

// What a design should actually run with. A saved choice is the user's - opening a panel is not consent to
// change it - so it is kept whenever the allocator can run it.
describe('effectiveAllocationStrategy', () => {
    const defaultStrategy = getDefaultSampleAllocation().allocationStrategy

    it('keeps a strategy the design can run', () => {
        expect(effectiveAllocationStrategy({allocationStrategy: 'OPTIMAL', proportionsApplicable: true, defaultStrategy}))
            .toBe('OPTIMAL')
    })

    it('falls back for a strategy nobody recognizes, and for none at all', () => {
        expect(effectiveAllocationStrategy({allocationStrategy: 'NONSENSE', proportionsApplicable: true, defaultStrategy}))
            .toBe(defaultStrategy)
        expect(effectiveAllocationStrategy({allocationStrategy: undefined, proportionsApplicable: true, defaultStrategy}))
            .toBe(defaultStrategy)
    })

    // Applicability, not whether rows exist yet: rows that are pending or momentarily empty are a lifecycle
    // state, not a reason to change what the user chose.
    it('replaces a proportion-reading strategy only when proportions do not apply', () => {
        expect(effectiveAllocationStrategy({allocationStrategy: 'OPTIMAL', proportionsApplicable: false, defaultStrategy}))
            .toBe(defaultStrategy)
        expect(effectiveAllocationStrategy({allocationStrategy: 'EQUAL', proportionsApplicable: false, defaultStrategy}))
            .toBe('EQUAL')
    })
})

// A saved allocation as the calculation has to see it: every explicitly saved value wins, and anything a
// recipe saved before that field existed falls back to what a new recipe starts with.
describe('effectiveSampleAllocation', () => {
    const defaults = getDefaultSampleAllocation()

    it('fills in only the settings a recipe never saved', () => {
        const model = design({confidenceLevel: 80})
        delete model.sampleAllocation.powerTuningConstant
        const effective = effectiveSampleAllocation({model, defaults})
        expect(effective.confidenceLevel).toBe(80)
        expect(effective.powerTuningConstant).toBe(defaults.powerTuningConstant)
    })

    it('resolves the strategy against the design it belongs to', () => {
        const model = design({allocationStrategy: 'OPTIMAL', skip: true})
        expect(effectiveSampleAllocation({model, defaults}).allocationStrategy).toBe(defaults.allocationStrategy)
    })
})
