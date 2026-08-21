import _ from 'lodash'

import {marginOfErrorFor} from './allocationOutcome'
import {planDerivedUpdates, planModelUpdates, proportionValues} from './planDerivedUpdates'

const model = overrides => _.merge({}, {
    aoi: {type: 'EE_TABLE', id: 'countries/SDN'},
    stratification: {
        skip: false,
        type: 'ASSET',
        assetId: 'users/x/strata',
        band: 'class',
        crs: 'EPSG:4326',
        scale: 30,
        strata: [
            {value: 1, label: 'Forest', color: '#0a0', area: 300, weight: 0.3},
            {value: 2, label: 'Non-forest', color: '#a00', area: 700, weight: 0.7}
        ]
    },
    proportions: {
        skip: false,
        manual: [],
        anticipatedProportions: [{stratum: 1, proportion: 0.4}, {stratum: 2, proportion: 0.1}]
    },
    sampleAllocation: {
        manual: [],
        estimateSampleSize: false,
        sampleSize: 100,
        confidenceLevel: 95,
        allocationStrategy: 'PROPORTIONAL',
        minSamplesPerStratum: '2',
        powerTuningConstant: '0.5',
        allocation: [{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}]
    }
}, overrides)

// _.merge would deep-merge arrays element by element, keeping vanished entries; these replace outright.
const withStrata = (base, strata) => ({...base, stratification: {...base.stratification, strata}})
const withProportions = (base, anticipatedProportions) =>
    ({...base, proportions: {...base.proportions, anticipatedProportions}})
const withAllocation = (base, allocation) =>
    ({...base, sampleAllocation: {...base.sampleAllocation, allocation}})

const SHIFTED_WEIGHTS = [
    {value: 1, label: 'Forest', color: '#0a0', area: 500, weight: 0.5},
    {value: 2, label: 'Non-forest', color: '#a00', area: 500, weight: 0.5}
]
const RESCALED_AREAS = [
    {value: 1, label: 'Forest', color: '#0a0', area: 600, weight: 0.3},
    {value: 2, label: 'Non-forest', color: '#a00', area: 1400, weight: 0.7}
]
const RENAMED = [
    {value: 1, label: 'Woodland', color: '#00f', area: 300, weight: 0.3},
    {value: 2, label: 'Non-forest', color: '#a00', area: 700, weight: 0.7}
]
const EXTRA_STRATUM = [
    {value: 1, label: 'Forest', color: '#0a0', area: 300, weight: 0.3},
    {value: 2, label: 'Non-forest', color: '#a00', area: 600, weight: 0.6},
    {value: 3, label: 'Water', color: '#00a', area: 100, weight: 0.1}
]
const CHANGED_PROPORTIONS = [{stratum: 1, proportion: 0.9}, {stratum: 2, proportion: 0.05}]

const skippedProportions = base => ({...base, proportions: {skip: true}})
const manualProportions = base => ({...base, proportions: {...base.proportions, manual: [true]}})
const manualAllocation = base => ({...base, sampleAllocation: {...base.sampleAllocation, manual: [true]}})
const strategy = (base, allocationStrategy) =>
    ({...base, sampleAllocation: {...base.sampleAllocation, allocationStrategy}})
const errorMode = base =>
    ({...base, sampleAllocation: {...base.sampleAllocation, estimateSampleSize: true, marginOfError: 50}})

const base = model()

const applyUpdates = (model, updates) =>
    updates.reduce((updated, [path, value]) => _.set(updated, path, value), _.cloneDeep(model))

// Applies the plan back into the model it was planned from, repeatedly, the way Sync does. Terminating is
// itself the property under test: a planner that reacted to its own writes would never stop.
const settle = (previous, next) => {
    for (let round = 1; round <= 4; round++) {
        const updates = planModelUpdates(previous, next)
        if (!updates.length) {
            return {model: next, rounds: round - 1}
        }
        previous = next
        next = applyUpdates(next, updates)
    }
    throw new Error('plan never settled')
}

const staleProportions = base => ({...base, proportions: {...base.proportions, requiresUpdate: true}})

const actions = (previous, next) => {
    const plan = planDerivedUpdates(previous, next)
    return {proportions: plan.proportions.action, allocation: plan.allocation.action}
}

describe('planDerivedUpdates - proportions', () => {
    const cases = [
        // Skipped proportions are not applicable, whatever changed upstream. They are never stale, so they
        // can never block Retrieve or light up the toolbar.
        ['skipped, area and weight changed', skippedProportions(base), skippedProportions(withStrata(base, SHIFTED_WEIGHTS)), 'notApplicable'],
        ['skipped, stratification frame changed', skippedProportions(base), skippedProportions(_.merge({}, base, {stratification: {scale: 100}})), 'notApplicable'],

        // Manual proportions are a within-stratum judgement. Nothing about the frame, the AOI or how big a
        // stratum turned out changes what the user meant by "40% of the forest".
        ['manual, weights changed', manualProportions(base), manualProportions(withStrata(base, SHIFTED_WEIGHTS)), 'keep'],
        ['manual, areas rescaled', manualProportions(base), manualProportions(withStrata(base, RESCALED_AREAS)), 'keep'],
        ['manual, Stratification Scale changed', manualProportions(base), manualProportions(_.merge({}, base, {stratification: {scale: 100}})), 'keep'],
        ['manual, AOI changed', manualProportions(base), manualProportions(_.merge({}, base, {aoi: {id: 'countries/KEN'}})), 'keep'],
        ['manual, source changed', manualProportions(base), manualProportions(_.merge({}, base, {stratification: {assetId: 'users/x/other'}})), 'keep'],
        // A new stratum has no manual answer, and inventing a zero would silently claim one.
        ['manual, stratum added', manualProportions(base), manualProportions(withStrata(base, EXTRA_STRATUM)), 'needsInput'],

        // Calculated proportions come out of an Earth Engine reduction over the frame, so the frame and the
        // stratum identities are exactly what they depend on.
        // Scale and the CRS transform change how large a stratum turns out - its weight - but the reduction
        // still groups by stratum over the same AOI in the same CRS, so the proportions it produces do not move.
        ['calculated, Stratification Scale changed', base, _.merge({}, base, {stratification: {scale: 100}}), 'keep'],
        ['calculated, Stratification transform changed', base, _.merge({}, base, {stratification: {crsTransform: [10, 0, 0, 0, -10, 0]}}), 'keep'],
        ['calculated, CRS changed', base, _.merge({}, base, {stratification: {crs: 'EPSG:6933'}}), 'recalculate'],
        ['calculated, source changed', base, _.merge({}, base, {stratification: {assetId: 'users/x/other'}}), 'recalculate'],
        ['calculated, band changed', base, _.merge({}, base, {stratification: {band: 'other'}}), 'recalculate'],
        ['calculated, AOI changed', base, _.merge({}, base, {aoi: {id: 'countries/KEN'}}), 'recalculate'],
        ['calculated, stratum added', base, withStrata(base, EXTRA_STRATUM), 'recalculate'],
        // Area and weight are outputs of the same stratification the proportions were computed against, not
        // inputs to the reduction.
        ['calculated, weights changed', base, withStrata(base, SHIFTED_WEIGHTS), 'keep'],
        ['calculated, label and color changed', base, withStrata(base, RENAMED), 'keep'],
        ['calculated, nothing changed', base, base, 'keep']
    ]

    it.each(cases)('%s -> %s', (_name, previous, next, expected) => {
        expect(actions(previous, next).proportions).toBe(expected)
    })

    it('never marks a skipped proportions section as requiring an update', () => {
        const plan = planDerivedUpdates(skippedProportions(base), skippedProportions(withStrata(base, EXTRA_STRATUM)))
        expect(plan.proportions.requiresUpdate).toBe(false)
    })

    it('requires an update for Earth Engine work, and says nothing about the flag when it changes nothing', () => {
        expect(planDerivedUpdates(base, withStrata(base, EXTRA_STRATUM)).proportions.requiresUpdate).toBe(true)
        // A plan describes a transition; a section it leaves alone may still be stale from an earlier edit,
        // so `keep` must not clear the flag.
        expect('requiresUpdate' in planDerivedUpdates(base, withStrata(base, RENAMED)).proportions).toBe(false)
    })

    // Manual proportions are rendered from their own rows, so an added stratum has to arrive as a row before
    // it can be answered - carrying no proportion, and never a zero.
    it('reconciles manual proportion rows onto an added stratum without inventing a proportion', () => {
        const plan = planDerivedUpdates(manualProportions(base), manualProportions(withStrata(base, EXTRA_STRATUM)))
        expect(plan.proportions.action).toBe('needsInput')
        expect(plan.proportions.requiresUpdate).toBe(true)
        expect(plan.proportions.anticipatedProportions).toEqual([
            {stratum: 1, proportion: 0.4},
            {stratum: 2, proportion: 0.1},
            {stratum: 3}
        ])
    })

    // A removed stratum leaves every remaining answer intact and nothing for anyone to supply, so asking the
    // user to reopen the panel would be asking them to confirm a deletion they already made.
    it('drops a removed stratum without requiring input', () => {
        const plan = planDerivedUpdates(manualProportions(base), manualProportions(withStrata(base, [base.stratification.strata[0]])))
        expect(plan.proportions.action).toBe('reconcileManual')
        expect(plan.proportions.requiresUpdate).toBe(false)
        expect(plan.proportions.anticipatedProportions).toEqual([{stratum: 1, proportion: 0.4}])
    })

    // Reordering is not an identity change, so there is nothing to reconcile and nothing to answer.
    it('leaves manual proportions alone when the strata are only reordered', () => {
        const previous = manualProportions(base)
        const next = manualProportions(withStrata(base, [base.stratification.strata[1], base.stratification.strata[0]]))
        expect(planDerivedUpdates(previous, next).proportions.action).toBe('keep')
    })
})

describe('planDerivedUpdates - allocation dependency matrix', () => {
    const cases = [
        // Manual counts are the user's, keyed by stratum. Only the key set can invalidate them.
        ['manual, weights changed', manualAllocation(base), manualAllocation(withStrata(base, SHIFTED_WEIGHTS)), 'refreshUncertainty'],
        ['manual, areas rescaled', manualAllocation(base), manualAllocation(withStrata(base, RESCALED_AREAS)), 'keep'],
        ['manual, label and color changed', manualAllocation(base), manualAllocation(withStrata(base, RENAMED)), 'keep'],
        ['manual, proportions changed', manualAllocation(base), manualAllocation(withProportions(base, CHANGED_PROPORTIONS)), 'refreshUncertainty'],
        ['manual, stratum added', manualAllocation(base), manualAllocation(withStrata(base, EXTRA_STRATUM)), 'needsInput'],

        // Fixed total sample size: each strategy depends on exactly the quantities its formula reads.
        ['fixed EQUAL, weights changed', strategy(base, 'EQUAL'), strategy(withStrata(base, SHIFTED_WEIGHTS), 'EQUAL'), 'refreshUncertainty'],
        ['fixed EQUAL, proportions changed', strategy(base, 'EQUAL'), strategy(withProportions(base, CHANGED_PROPORTIONS), 'EQUAL'), 'refreshUncertainty'],
        ['fixed EQUAL, stratum added', strategy(base, 'EQUAL'), strategy(withStrata(base, EXTRA_STRATUM), 'EQUAL'), 'recalculate'],
        ['fixed PROPORTIONAL, weights changed', base, withStrata(base, SHIFTED_WEIGHTS), 'recalculate'],
        ['fixed PROPORTIONAL, areas rescaled', base, withStrata(base, RESCALED_AREAS), 'keep'],
        ['fixed PROPORTIONAL, proportions changed', base, withProportions(base, CHANGED_PROPORTIONS), 'refreshUncertainty'],
        ['fixed BALANCED, weights changed', strategy(base, 'BALANCED'), strategy(withStrata(base, SHIFTED_WEIGHTS), 'BALANCED'), 'recalculate'],
        ['fixed BALANCED, proportions changed', strategy(base, 'BALANCED'), strategy(withProportions(base, CHANGED_PROPORTIONS), 'BALANCED'), 'refreshUncertainty'],
        ['fixed OPTIMAL, proportions changed', strategy(base, 'OPTIMAL'), strategy(withProportions(base, CHANGED_PROPORTIONS), 'OPTIMAL'), 'recalculate'],
        ['fixed OPTIMAL, weights changed', strategy(base, 'OPTIMAL'), strategy(withStrata(base, SHIFTED_WEIGHTS), 'OPTIMAL'), 'recalculate'],
        ['fixed POWER, proportions changed', strategy(base, 'POWER'), strategy(withProportions(base, CHANGED_PROPORTIONS), 'POWER'), 'recalculate'],
        ['fixed POWER, label and color changed', strategy(base, 'POWER'), strategy(withStrata(base, RENAMED), 'POWER'), 'keep'],

        // Error mode solves the total sample size from anticipated uncertainty, so every strategy depends on
        // both weights and proportions.
        ['error EQUAL, proportions changed', errorMode(strategy(base, 'EQUAL')), errorMode(strategy(withProportions(base, CHANGED_PROPORTIONS), 'EQUAL')), 'recalculate'],
        ['error EQUAL, weights changed', errorMode(strategy(base, 'EQUAL')), errorMode(strategy(withStrata(base, SHIFTED_WEIGHTS), 'EQUAL')), 'recalculate'],
        ['error PROPORTIONAL, proportions changed', errorMode(base), errorMode(withProportions(base, CHANGED_PROPORTIONS)), 'recalculate'],
        ['error PROPORTIONAL, label and color changed', errorMode(base), errorMode(withStrata(base, RENAMED)), 'keep'],

        // Nothing at all changed.
        ['fixed PROPORTIONAL, nothing changed', base, base, 'keep']
    ]

    it.each(cases)('%s -> %s', (_name, previous, next, expected) => {
        expect(actions(previous, next).allocation).toBe(expected)
    })
})

describe('planDerivedUpdates - automatic recomputation', () => {
    // Witness: skipped proportions, Proportional allocation, changed weights. The counts follow the new
    // weights without the Allocation panel ever being opened, so nothing is left for the user to do.
    it('recomputes a Proportional allocation from changed weights with proportions skipped', () => {
        const previous = skippedProportions(base)
        const next = skippedProportions(withStrata(base, SHIFTED_WEIGHTS))
        const {allocation} = planDerivedUpdates(previous, next)
        expect(allocation.action).toBe('recalculate')
        expect(allocation.allocation).toEqual([{stratum: 1, sampleSize: 50}, {stratum: 2, sampleSize: 50}])
        expect(allocation.requiresUpdate).toBe(false)
    })

    it('writes count-only rows, never a joined copy of the strata', () => {
        const {allocation} = planDerivedUpdates(base, withStrata(base, SHIFTED_WEIGHTS))
        allocation.allocation.forEach(row => expect(Object.keys(row).sort()).toEqual(['sampleSize', 'stratum']))
    })

    // Witness: a proportion change leaves fixed Equal/Proportional/Balanced counts alone and only refreshes
    // the derived uncertainty, while the proportion-driven strategies actually recompute.
    it('preserves fixed Proportional counts across a proportion change and refreshes the margin', () => {
        const {allocation} = planDerivedUpdates(base, withProportions(base, CHANGED_PROPORTIONS))
        expect(allocation.action).toBe('refreshUncertainty')
        expect('allocation' in allocation).toBe(false)
        expect(Number.isFinite(allocation.marginOfError)).toBe(true)
    })

    it('recomputes Optimal counts across a proportion change', () => {
        const previous = strategy(base, 'OPTIMAL')
        const next = strategy(withProportions(base, CHANGED_PROPORTIONS), 'OPTIMAL')
        const {allocation} = planDerivedUpdates(previous, next)
        // Derived independently, not recorded: Optimal is Power with a tuning constant of 1, so the weight
        // for stratum k is cv_k * (w_k * p_k). With p = [0.9, 0.05] and w = [0.3, 0.7] those are
        // (0.3/0.9)*0.27 = 0.09 and (sqrt(0.0475)/0.05)*0.035 = 0.15256, giving 37 and 63 of 100.
        expect(allocation.action).toBe('recalculate')
        expect(allocation.allocation).toEqual([{stratum: 1, sampleSize: 37}, {stratum: 2, sampleSize: 63}])
    })

    it('solves a new total sample size in error mode', () => {
        const previous = errorMode(base)
        const next = errorMode(withProportions(base, CHANGED_PROPORTIONS))
        const {allocation} = planDerivedUpdates(previous, next)
        expect(allocation.action).toBe('recalculate')
        expect(Number.isFinite(allocation.sampleSize)).toBe(true)
        expect(_.sumBy(allocation.allocation, 'sampleSize')).toBe(allocation.sampleSize)
    })

    // Witness: manual counts survive a proportion change untouched.
    it('leaves manual counts untouched when proportions change', () => {
        const previous = manualAllocation(base)
        const next = manualAllocation(withProportions(base, CHANGED_PROPORTIONS))
        const {allocation} = planDerivedUpdates(previous, next)
        expect('allocation' in allocation).toBe(false)
        expect(allocation.requiresUpdate).toBe(false)
    })
})

describe('planDerivedUpdates - manual reconciliation', () => {
    // Witness: a new stratum keeps every answered count, drops nothing that still exists, and asks only for
    // the count it genuinely has no answer for.
    it('preserves existing counts, adds the new key without a count, and requires input', () => {
        const previous = manualAllocation(base)
        const next = manualAllocation(withStrata(base, EXTRA_STRATUM))
        const {allocation} = planDerivedUpdates(previous, next)
        expect(allocation.action).toBe('needsInput')
        expect(allocation.allocation).toEqual([
            {stratum: 1, sampleSize: 30},
            {stratum: 2, sampleSize: 70},
            {stratum: 3}
        ])
        expect(allocation.requiresUpdate).toBe(true)
    })

    it('removes a vanished stratum without requiring input', () => {
        const previous = manualAllocation(base)
        const next = manualAllocation(withStrata(base, [base.stratification.strata[0]]))
        const {allocation} = planDerivedUpdates(previous, next)
        expect(allocation.action).toBe('reconcileManual')
        expect(allocation.allocation).toEqual([{stratum: 1, sampleSize: 30}])
        expect(allocation.requiresUpdate).toBe(false)
    })

    // Reconciliation is keyed, not positional. Dropping the FIRST stratum is what separates the two: a
    // positional pass would slide stratum 2's count onto stratum 3.
    it('matches counts by key rather than by position when a stratum is dropped from the middle', () => {
        const threeStrata = withAllocation(withStrata(base, EXTRA_STRATUM), [
            {stratum: 1, sampleSize: 10},
            {stratum: 2, sampleSize: 20},
            {stratum: 3, sampleSize: 30}
        ])
        const previous = manualAllocation(threeStrata)
        const next = manualAllocation(withStrata(threeStrata, [EXTRA_STRATUM[1], EXTRA_STRATUM[2]]))
        const {allocation} = planDerivedUpdates(previous, next)
        expect(allocation.allocation).toEqual([{stratum: 2, sampleSize: 20}, {stratum: 3, sampleSize: 30}])
    })

    // Reordering alone is not an identity change, so manual counts must survive it untouched.
    it('leaves manual counts alone when the strata are only reordered', () => {
        const previous = manualAllocation(base)
        const next = manualAllocation(withStrata(base, [base.stratification.strata[1], base.stratification.strata[0]]))
        expect(planDerivedUpdates(previous, next).allocation.action).toBe('keep')
    })
})

describe('planDerivedUpdates - waiting on proportions', () => {
    const frameChanged = base => _.merge({}, base, {stratification: {crs: 'EPSG:6933'}})

    // A calculated-proportions frame change makes the proportions stale, and an allocation that reads them
    // must not be recomputed against the stale ones - even in the same transition, before the flag is written.
    it('waits rather than recomputing an Optimal allocation against proportions this edit just invalidated', () => {
        const plan = planDerivedUpdates(strategy(base, 'OPTIMAL'), strategy(frameChanged(base), 'OPTIMAL'))
        expect(plan.proportions.action).toBe('recalculate')
        expect(plan.allocation.action).toBe('waitForProportions')
        expect('allocation' in plan.allocation).toBe(false)
    })

    // And keeps waiting on every later edit, for as long as the flag is up.
    it('keeps waiting while the proportions section is still flagged', () => {
        const stale = staleProportions(strategy(base, 'OPTIMAL'))
        expect(planDerivedUpdates(stale, withStrata(stale, SHIFTED_WEIGHTS)).allocation.action).toBe('waitForProportions')
    })

    // An unanswered manual proportion row is a row the planner itself created so the user can fill it in.
    // Treating its arrival as fresh input would recompute the allocation against a blank.
    it('waits while a reconciled manual proportion row is still unanswered', () => {
        const manual = manualProportions(strategy(base, 'OPTIMAL'))
        const added = withProportions(manualProportions(strategy(withStrata(base, EXTRA_STRATUM), 'OPTIMAL')),
            [{stratum: 1, proportion: 0.4}, {stratum: 2, proportion: 0.1}, {stratum: 3}])
        expect(planDerivedUpdates(manual, added).allocation.action).toBe('waitForProportions')
    })

    // A strategy that never reads proportions has no reason to wait for them: its counts follow the new
    // weights immediately, however stale the proportions section happens to be.
    it('does not wait when the strategy ignores proportions', () => {
        const stale = staleProportions(strategy(base, 'PROPORTIONAL'))
        const {allocation} = planDerivedUpdates(stale, withStrata(stale, SHIFTED_WEIGHTS))
        expect(allocation.action).toBe('recalculate')
        expect(allocation.allocation).toEqual([{stratum: 1, sampleSize: 50}, {stratum: 2, sampleSize: 50}])
    })

    // The witness for the whole failure: recalculated proportions can land on exactly the numbers they
    // replaced, so nothing numeric moves when they arrive. An allocation released from waiting by a VALUE
    // change would stay on counts computed from the old weights, and Retrieve would accept them.
    it('recomputes after waiting even when the recalculated proportions are numerically identical', () => {
        const start = strategy(base, 'OPTIMAL')
        const framed = strategy(withStrata(frameChanged(base), SHIFTED_WEIGHTS), 'OPTIMAL')

        const waiting = settle(start, framed)
        expect(waiting.model.proportions.requiresUpdate).toBe(true)
        expect(waiting.model.sampleAllocation.allocation).toEqual(start.sampleAllocation.allocation)

        // Earth Engine returns the same numbers; only the lifecycle moves.
        const resolved = _.merge(_.cloneDeep(waiting.model), {proportions: {requiresUpdate: false}})
        expect(proportionValues(resolved)).toEqual(proportionValues(waiting.model))

        const done = settle(waiting.model, resolved)
        // Derived independently: Optimal is Power at a tuning constant of 1, so stratum k weighs
        // cv_k * (w_k * p_k). With p = [0.4, 0.1] and the NEW w = [0.5, 0.5] those are 0.24495 and 0.15,
        // giving 62 and 38 of 100 - the old weights would have given a different split.
        expect(done.model.sampleAllocation.allocation).toEqual([
            {stratum: 1, sampleSize: 62},
            {stratum: 2, sampleSize: 38}
        ])
        expect(!!done.model.sampleAllocation.requiresUpdate).toBe(false)
    })

    // Error mode solves its total from anticipated uncertainty, so being released must resolve the total too.
    it('resolves the total sample size when error mode is released from waiting', () => {
        const waiting = staleProportions(errorMode(base))
        const resolved = _.merge(_.cloneDeep(waiting), {proportions: {requiresUpdate: false}})
        const {allocation} = planDerivedUpdates(waiting, resolved)
        expect(allocation.action).toBe('recalculate')
        expect(Number.isFinite(allocation.sampleSize)).toBe(true)
        expect(_.sumBy(allocation.allocation, 'sampleSize')).toBe(allocation.sampleSize)
    })
})

describe('planDerivedUpdates - proportions become inapplicable', () => {
    // Skipping Proportions leaves an Optimal or error-mode allocation reading something that no longer
    // exists. The panel already applies a proportion-free policy when it opens; applying it here is what
    // stops Retrieve from being blocked on a panel the user has nothing to decide in.
    const settleSkipped = previous => settle(previous, skippedProportions(previous))

    it('settles an Optimal allocation into fixed Balanced, preserving the total', () => {
        const {model} = settleSkipped(strategy(base, 'OPTIMAL'))
        expect(model.sampleAllocation.allocationStrategy).toBe('BALANCED')
        expect(model.sampleAllocation.estimateSampleSize).toBe(false)
        expect(model.sampleAllocation.sampleSize).toBe(100)
        expect(_.sumBy(model.sampleAllocation.allocation, 'sampleSize')).toBe(100)
        expect(model.sampleAllocation.marginOfError).toBe(null)
        expect(!!model.sampleAllocation.requiresUpdate).toBe(false)
        expect(!!model.proportions.requiresUpdate).toBe(false)
    })

    it('keeps the last solved total when error mode becomes fixed', () => {
        const solved = {...errorMode(base), sampleAllocation: {...errorMode(base).sampleAllocation, sampleSize: 137}}
        const {model} = settleSkipped(solved)
        expect(model.sampleAllocation.estimateSampleSize).toBe(false)
        expect(model.sampleAllocation.sampleSize).toBe(137)
        expect(_.sumBy(model.sampleAllocation.allocation, 'sampleSize')).toBe(137)
    })

    // A strategy that never read proportions is already valid without them, so nothing about the mode moves.
    it('leaves an already proportion-free strategy alone', () => {
        const {model} = settleSkipped(strategy(base, 'PROPORTIONAL'))
        expect(model.sampleAllocation.allocationStrategy).toBe('PROPORTIONAL')
        expect(model.sampleAllocation.allocation).toEqual([{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}])
    })

    // Manual counts are the user's whatever the hidden strategy field happens to say.
    it('does not touch a manual allocation carrying a dormant Optimal strategy', () => {
        const {model} = settleSkipped(manualAllocation(strategy(base, 'OPTIMAL')))
        expect(model.sampleAllocation.allocation).toEqual([{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}])
        expect(model.sampleAllocation.allocationStrategy).toBe('OPTIMAL')
    })
})

describe('planDerivedUpdates - uncertainty follows weights as well as proportions', () => {
    // The derived margin reads weights AND proportions, so "the counts ignore weights" does not make the
    // section ignore them. Counts must be identical and the margin must not be.
    const marginAfterWeightChange = previous => {
        const {allocation} = planDerivedUpdates(previous, withStrata(previous, SHIFTED_WEIGHTS))
        expect(allocation.action).toBe('refreshUncertainty')
        expect('allocation' in allocation).toBe(false)
        return allocation.marginOfError
    }

    it('refreshes a manual allocation margin without moving a single count', () => {
        const previous = manualAllocation(base)
        const refreshed = marginAfterWeightChange(previous)
        expect(Number.isFinite(refreshed)).toBe(true)
        expect(refreshed).not.toBe(marginOfErrorFor(previous))
    })

    it('refreshes a fixed Equal margin without moving a single count', () => {
        const previous = strategy(base, 'EQUAL')
        const refreshed = marginAfterWeightChange(previous)
        expect(Number.isFinite(refreshed)).toBe(true)
        expect(refreshed).not.toBe(marginOfErrorFor(previous))
    })

    // Without proportions there is no overall proportion for a margin to be relative to.
    it('keeps a proportion-free margin null', () => {
        const previous = manualAllocation(skippedProportions(base))
        const {allocation} = planDerivedUpdates(previous, withStrata(previous, SHIFTED_WEIGHTS))
        expect(allocation.marginOfError ?? null).toBe(null)
    })
})

describe('planDerivedUpdates - stratification', () => {
    // The strata themselves are an Earth Engine result over the AOI, so a new AOI makes them stale.
    it('marks stratification stale when the AOI changes', () => {
        const plan = planDerivedUpdates(base, _.merge({}, base, {aoi: {id: 'countries/KEN'}}))
        expect(plan.stratification).toEqual({action: 'recalculate', requiresUpdate: true})
    })

    it('leaves stratification alone when only its own strata change', () => {
        expect(planDerivedUpdates(base, withStrata(base, SHIFTED_WEIGHTS)).stratification.action).toBe('keep')
    })

    // Unstratified: the single synthetic stratum takes its area from the AOI geometry at the export boundary,
    // so there is no Earth Engine result for a new AOI to invalidate.
    it('never marks a skipped stratification stale', () => {
        const unstratified = _.merge({}, base, {stratification: {skip: true}})
        const plan = planDerivedUpdates(unstratified, _.merge({}, unstratified, {aoi: {id: 'countries/KEN'}}))
        expect(plan.stratification).toEqual({action: 'notApplicable', requiresUpdate: false})
    })
})

// The plan is applied by writing it back into the same model it was planned from, so a plan that reacted to
// its own writes would dispatch forever. Settling is the property that rules that out, and it is not visible
// from a single plan.
describe('planModelUpdates settles', () => {
    it('writes nothing at all when no semantic input moved', () => {
        expect(planModelUpdates(base, withStrata(base, RENAMED))).toEqual([])
        expect(planModelUpdates(base, base)).toEqual([])
    })

    // Witness: proportions skipped, manual allocation, area and weight changed. Nothing is stale and no count
    // moves; the task rows pick the new areas up at materialization.
    it('leaves a manual allocation and skipped proportions untouched when the areas change', () => {
        const previous = manualAllocation(skippedProportions(base))
        const {model, rounds} = settle(previous, manualAllocation(skippedProportions(withStrata(base, SHIFTED_WEIGHTS))))
        expect(rounds).toBeLessThanOrEqual(1)
        expect(model.sampleAllocation.allocation).toEqual(previous.sampleAllocation.allocation)
        expect(!!model.proportions.requiresUpdate).toBe(false)
        expect(!!model.sampleAllocation.requiresUpdate).toBe(false)
    })

    // Witness: proportions skipped, Proportional allocation, weights changed. The counts follow, and nothing
    // is left flagged for the user to open.
    it('settles a Proportional allocation onto the new weights with nothing left flagged', () => {
        const {model} = settle(skippedProportions(base), skippedProportions(withStrata(base, SHIFTED_WEIGHTS)))
        expect(model.sampleAllocation.allocation).toEqual([{stratum: 1, sampleSize: 50}, {stratum: 2, sampleSize: 50}])
        expect(!!model.sampleAllocation.requiresUpdate).toBe(false)
    })

    // Witness: an added stratum in manual mode asks for exactly one count, and asks only once.
    it('settles an added stratum into a single unanswered manual count', () => {
        const {model} = settle(manualAllocation(base), manualAllocation(withStrata(base, EXTRA_STRATUM)))
        expect(model.sampleAllocation.allocation).toEqual([
            {stratum: 1, sampleSize: 30},
            {stratum: 2, sampleSize: 70},
            {stratum: 3}
        ])
        expect(model.sampleAllocation.requiresUpdate).toBe(true)
    })

    // A stale flag belongs to the section, not to the edit that follows it: an unrelated later edit must not
    // quietly clear Earth Engine work that is still outstanding.
    it('does not clear an outstanding stale flag on a later unrelated edit', () => {
        const stale = _.merge({}, base, {proportions: {requiresUpdate: true}})
        const {model} = settle(stale, withStrata(stale, SHIFTED_WEIGHTS))
        expect(model.proportions.requiresUpdate).toBe(true)
    })
})
