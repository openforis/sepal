import _ from 'lodash'

import {marginOfErrorFor} from './allocationOutcome'
import {getDefaultModel, getDefaultSampleAllocation} from './defaultModel'
import {planDerivedUpdates, planModelUpdates, proportionValues} from './planDerivedUpdates'
import {isSectionStale, validateRetrieve} from './validateRetrieve'

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
        // The reduction runs at the PROPORTIONS Scale, which is concrete configuration. The Stratification
        // Scale changes how large a stratum turns out - its weight - but the reduction still groups by stratum
        // over the same AOI in the same CRS at the same resolution, so the proportions it produces do not move.
        ['calculated, Stratification Scale changed', base, _.merge({}, base, {stratification: {scale: 100}}), 'keep'],
        ['calculated, Proportions Scale changed', _.merge({}, base, {proportions: {scale: 50}}), _.merge({}, base, {proportions: {scale: 80}}), 'recalculate'],
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
        // Balanced is the mean of proportional (30/70) and equal (50/50). Optimal's own 30/70 also sums to
        // the total, so only the exact split shows whether the counts were actually recalculated.
        expect(model.sampleAllocation.allocation).toEqual([{stratum: 1, sampleSize: 40}, {stratum: 2, sampleSize: 60}])
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

// Balanced is what a new recipe starts on, so what it does and does not read matters more than for the
// strategies a user has to go and choose.
describe('planDerivedUpdates - a fixed Balanced allocation', () => {
    const balanced = strategy(base, 'BALANCED')

    // Balanced spreads the total over the strata from their identities and weights. Anticipated proportions
    // are not part of that arithmetic, so moving them cannot move a single count.
    it('holds its counts across a proportion change', () => {
        const plan = planDerivedUpdates(balanced, withProportions(balanced, CHANGED_PROPORTIONS))
        expect(plan.allocation.action).toBe('refreshUncertainty')
        expect('allocation' in plan.allocation).toBe(false)
    })

    // The uncertainty those counts imply does read proportions, so it is recomputed rather than left
    // describing the numbers it was derived from.
    it('refreshes the uncertainty the same change makes wrong', () => {
        const changed = withProportions(balanced, CHANGED_PROPORTIONS)
        const plan = planDerivedUpdates(balanced, changed)
        expect(plan.allocation.marginOfError).toBe(marginOfErrorFor(changed))
        expect(plan.allocation.marginOfError).not.toBe(marginOfErrorFor(balanced))
    })

    it('recomputes its counts when the weights move', () => {
        const plan = planDerivedUpdates(balanced, withStrata(balanced, SHIFTED_WEIGHTS))
        expect(plan.allocation.action).toBe('recalculate')
        expect(plan.allocation.allocation).toEqual([{stratum: 1, sampleSize: 50}, {stratum: 2, sampleSize: 50}])
    })

    // The planner runs with the panel shut, so a default of its own would rewrite a strategy to something a
    // new recipe would never start on.
    it('settles a design whose proportions went away onto the recipe default', () => {
        const optimal = strategy(base, 'OPTIMAL')
        const plan = planDerivedUpdates(optimal, skippedProportions(optimal))
        expect(plan.allocation.allocationStrategy).toBe(getDefaultSampleAllocation().allocationStrategy)
    })
})

// Recipes saved before a field was persisted still have to replan. The strategy is the one that bites: the
// allocator has no default for it and rejects an unknown one outright, and a model that names no strategy
// also reads as depending on nothing - so such a design either recalculates into a thrown error or quietly
// does not recalculate at all.
describe('planDerivedUpdates - a legacy allocation saved without a strategy', () => {
    const legacyWithout = (...unsaved) =>
        ({...base, sampleAllocation: _.omit(base.sampleAllocation, unsaved)})

    const legacy = () => legacyWithout('allocationStrategy')

    // A strategy nothing names looks weight-independent, so the counts were left describing the old weights.
    it('recalculates on the default strategy when the weights move', () => {
        const saved = legacy()
        const plan = planDerivedUpdates(saved, withStrata(saved, SHIFTED_WEIGHTS))
        expect(plan.allocation.action).toBe('recalculate')
        expect(plan.allocation.allocation).toEqual([{stratum: 1, sampleSize: 50}, {stratum: 2, sampleSize: 50}])
    })

    // Balanced is the mean of proportional (30/60/10) and equal (34 each), rounded, then trimmed by one to
    // land on the total: 32/47/22 sums to 101, so stratum 2 gives one back.
    it('allocates an added stratum on the default strategy', () => {
        const saved = legacy()
        expect(planDerivedUpdates(saved, withStrata(saved, EXTRA_STRATUM)).allocation.allocation).toEqual([
            {stratum: 1, sampleSize: 32},
            {stratum: 2, sampleSize: 46},
            {stratum: 3, sampleSize: 22}
        ])
    })

    it('persists the strategy it calculated with, and settles', () => {
        const saved = legacy()
        const {model} = settle(saved, withStrata(saved, SHIFTED_WEIGHTS))
        expect(model.sampleAllocation.allocationStrategy).toBe(getDefaultSampleAllocation().allocationStrategy)
        expect(model.sampleAllocation.allocationStrategy).toBe('BALANCED')
        expect(isSectionStale(model, 'sampleAllocation')).toBe(false)
    })

    // Counts that pass preflight while the settings behind them are missing leave Retrieve blocked with no
    // section flagged to send the user to.
    it('persists the settings it filled in, so Retrieve is not blocked by them', () => {
        const saved = legacyWithout('minSamplesPerStratum', 'confidenceLevel', 'powerTuningConstant')
        const {model} = settle(saved, withStrata(saved, SHIFTED_WEIGHTS))
        const defaults = getDefaultSampleAllocation()
        expect(model.sampleAllocation.minSamplesPerStratum).toBe(defaults.minSamplesPerStratum)
        expect(model.sampleAllocation.confidenceLevel).toBe(defaults.confidenceLevel)
        expect(model.sampleAllocation.powerTuningConstant).toBe(defaults.powerTuningConstant)
        expect(validateRetrieve(model).filter(({section}) => section === 'sampleAllocation')).toEqual([])
    })

    it('leaves a saved setting alone while filling in the ones next to it', () => {
        const saved = legacyWithout('confidenceLevel')
        const {model} = settle(saved, withStrata(saved, SHIFTED_WEIGHTS))
        expect(model.sampleAllocation.minSamplesPerStratum).toBe('2')
        expect(model.sampleAllocation.confidenceLevel).toBe(getDefaultSampleAllocation().confidenceLevel)
    })

    // A strategy nobody recognizes reaches the allocator exactly like a missing one.
    it('falls back to the default rather than allocating with a strategy it does not know', () => {
        const bogus = strategy(base, 'MYSTERY')
        const plan = planDerivedUpdates(bogus, withStrata(bogus, EXTRA_STRATUM))
        expect(plan.allocation.allocationStrategy).toBe(getDefaultSampleAllocation().allocationStrategy)
        expect(plan.allocation.allocation.every(({sampleSize}) => Number.isFinite(sampleSize))).toBe(true)
    })

    it('leaves an explicitly saved strategy alone', () => {
        const saved = strategy(base, 'EQUAL')
        const {model} = settle(saved, withStrata(saved, SHIFTED_WEIGHTS))
        expect(model.sampleAllocation.allocationStrategy).toBe('EQUAL')
    })

    it('leaves an explicitly saved proportion-dependent strategy alone while proportions apply', () => {
        const saved = strategy(base, 'OPTIMAL')
        const {model} = settle(saved, withStrata(saved, SHIFTED_WEIGHTS))
        expect(model.sampleAllocation.allocationStrategy).toBe('OPTIMAL')
    })
})

// Whether proportions apply is the user's choice; whether they are ready is a lifecycle state. Reading the
// second as the first turns a moment when the rows happen to be empty into a permanent change of strategy.
describe('planDerivedUpdates - proportions applicable but not ready', () => {
    const optimal = strategy(base, 'OPTIMAL')
    const notReady = staleProportions(withProportions(optimal, []))

    it('waits instead of rewriting a variance strategy the design still wants', () => {
        const plan = planDerivedUpdates(optimal, notReady)
        expect(plan.allocation.action).toBe('waitForProportions')
        expect('allocationStrategy' in plan.allocation).toBe(false)
    })

    // Optimal allocates in proportion to weight * sqrt(p(1-p)): 0.3*sqrt(0.09)=0.090 against
    // 0.7*sqrt(0.0475)=0.153, so 37/63 of the total.
    it('recalculates on Optimal once the proportions arrive', () => {
        const waited = settle(optimal, notReady).model
        const arrived = withProportions({...waited, proportions: {...waited.proportions, requiresUpdate: false}},
            CHANGED_PROPORTIONS)
        const {model} = settle(waited, arrived)
        expect(model.sampleAllocation.allocationStrategy).toBe('OPTIMAL')
        expect(model.sampleAllocation.allocation).toEqual([{stratum: 1, sampleSize: 37}, {stratum: 2, sampleSize: 63}])
    })
})

// needsInput reports that a number is missing. In error mode that number is the user's own target, and a
// target the planner cannot use is still the one they typed.
describe('planDerivedUpdates - needsInput leaves the target alone', () => {
    const errorModeTarget = marginOfError =>
        ({...base, sampleAllocation: {...base.sampleAllocation, estimateSampleSize: true, marginOfError}})

    it('does not rewrite an error-mode target it cannot use', () => {
        const invalid = errorModeTarget(-1)
        const plan = planDerivedUpdates(invalid, withStrata(invalid, SHIFTED_WEIGHTS))
        expect(plan.allocation.action).toBe('needsInput')
        expect('marginOfError' in plan.allocation).toBe(false)
    })

    it('does not rewrite an error-mode target that was never given', () => {
        const missing = errorModeTarget(null)
        const plan = planDerivedUpdates(missing, withStrata(missing, SHIFTED_WEIGHTS))
        expect('marginOfError' in plan.allocation).toBe(false)
    })

    // In fixed mode the margin is derived from the counts rather than typed, so a margin describing counts
    // that no longer exist has to go.
    it('clears a derived margin whose counts have gone', () => {
        const {sampleSize: _none, ...sampleAllocation} = base.sampleAllocation
        const noTarget = {...base, sampleAllocation}
        const plan = planDerivedUpdates(noTarget, withStrata(noTarget, SHIFTED_WEIGHTS))
        expect(plan.allocation.action).toBe('needsInput')
        expect(plan.allocation.marginOfError).toBe(null)
    })
})

describe('planDerivedUpdates - an effective strategy change invalidates the counts', () => {
    const BALANCED_COUNTS = [{stratum: 1, sampleSize: 40}, {stratum: 2, sampleSize: 60}]

    it('recalculates when a filled-in strategy replaces a missing one on a proportion-only change', () => {
        const saved = {...base, sampleAllocation: _.omit(base.sampleAllocation, 'allocationStrategy')}
        const {model} = settle(saved, withProportions(saved, CHANGED_PROPORTIONS))
        expect(model.sampleAllocation.allocationStrategy).toBe('BALANCED')
        expect(model.sampleAllocation.allocation).toEqual(BALANCED_COUNTS)
    })

    it('recalculates when a strategy nobody recognizes is replaced on a proportion-only change', () => {
        const saved = strategy(base, 'MYSTERY')
        const {model} = settle(saved, withProportions(saved, CHANGED_PROPORTIONS))
        expect(model.sampleAllocation.allocationStrategy).toBe('BALANCED')
        expect(model.sampleAllocation.allocation).toEqual(BALANCED_COUNTS)
    })

    // The counts a strategy produced are only correct for that strategy, so replacing it is exactly as
    // invalidating as moving the weights it read.
    it('recalculates when proportions go away and a variance strategy is replaced', () => {
        const optimal = strategy(base, 'OPTIMAL')
        const {model} = settle(optimal, skippedProportions(optimal))
        expect(model.sampleAllocation.allocationStrategy).toBe('BALANCED')
        expect(model.sampleAllocation.allocation).toEqual(BALANCED_COUNTS)
    })

    it('leaves the counts alone when the strategy it was given is the strategy it runs', () => {
        const balanced = withAllocation(strategy(base, 'BALANCED'), BALANCED_COUNTS)
        const plan = planDerivedUpdates(balanced, withProportions(balanced, CHANGED_PROPORTIONS))
        expect(plan.allocation.action).toBe('refreshUncertainty')
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

// The lifecycle of a brand new recipe, driven through the planner exactly as Sync drives it. A new recipe
// carries every allocation setting except the two it cannot derive - the total sample size and the counts
// that follow from it - so the first thing to reach the allocation is a set of strata with no total to
// spread over them, a number only a person can supply.
describe('planDerivedUpdates - an allocation with no target yet', () => {
    const AOI = {type: 'EE_TABLE', id: 'countries/SDN'}
    const CALCULATED_STRATA = [
        {value: 1, label: 'Forest', color: '#0a0', area: 300, weight: 0.3},
        {value: 2, label: 'Non-forest', color: '#a00', area: 700, weight: 0.7}
    ]
    const CALCULATED_PROPORTIONS = [{stratum: 1, proportion: 0.4}, {stratum: 2, proportion: 0.1}]
    // The Scale the Proportions panel resolved for the selected property band and calculated at. Not the
    // recipe default: an asset-derived default is whatever the band reports - 10, 100, something fractional.
    const SUBMITTED_SCALE = 100

    const newRecipe = () => ({...getDefaultModel(), aoi: AOI})

    const stratificationCompleted = model => ({
        ...model,
        stratification: {...model.stratification, requiresUpdate: false, strata: CALCULATED_STRATA}
    })

    // The persisted calculation state this planner reads: the concrete Scale and the rows calculated at it,
    // arriving together and already settled. Deliberately minimal - not the panel's whole output.
    const proportionsCompleted = model => ({
        ...model,
        proportions: {
            skip: false,
            manual: [],
            requiresUpdate: false,
            scale: SUBMITTED_SCALE,
            anticipatedProportions: CALCULATED_PROPORTIONS
        }
    })

    // Stratification, then Proportions, each settled the way Sync settles it.
    const throughProportions = () => {
        const created = newRecipe()
        const stratified = settle(created, stratificationCompleted(created)).model
        return settle(stratified, proportionsCompleted(stratified)).model
    }

    it('keeps the allocation flagged after the whole new-recipe lifecycle', () => {
        const model = throughProportions()
        expect(model.sampleAllocation.requiresUpdate).toBe(true)
        expect(isSectionStale(model, 'sampleAllocation')).toBe(true)
    })

    it('shows the strata without inventing counts or a total', () => {
        const {sampleAllocation} = throughProportions()
        expect(sampleAllocation.allocation).toEqual([{stratum: 1}, {stratum: 2}])
        expect(sampleAllocation.sampleSize).toBeUndefined()
    })

    it('reports needing input rather than a recalculation when the strata first arrive', () => {
        const created = newRecipe()
        expect(actions(created, stratificationCompleted(created)).allocation).toBe('needsInput')
    })

    // Finishing Proportions moves numbers the fixed strategy does not read for its counts. That is not a
    // reason to call the allocation settled.
    it('cannot be cleared by finishing proportions', () => {
        const created = newRecipe()
        const stratified = settle(created, stratificationCompleted(created)).model
        expect(stratified.sampleAllocation.requiresUpdate).toBe(true)
        const {model} = settle(stratified, proportionsCompleted(stratified))
        expect(model.sampleAllocation.requiresUpdate).toBe(true)
    })

    // A completed submission owns the inputs it was calculated with. The Scale arriving with the result is
    // not an edit to that result - it IS that result's Scale - so flagging it stale asks the user to
    // recalculate what they just calculated, and only a second Apply (which moves no Scale) ever settles.
    it('does not reflag the submission that brought the Scale with it', () => {
        const created = newRecipe()
        const stratified = settle(created, stratificationCompleted(created)).model
        expect(stratified.proportions?.scale).toBeUndefined()

        const submitted = proportionsCompleted(stratified)
        expect(planModelUpdates(stratified, submitted))
            .not.toContainEqual([['proportions', 'requiresUpdate'], true])

        const {model} = settle(stratified, submitted)
        expect(model.proportions.scale).toBe(SUBMITTED_SCALE)
        expect(!!model.proportions.requiresUpdate).toBe(false)
        // The allocation is untouched by this: it still has no total to spread.
        expect(model.sampleAllocation.requiresUpdate).toBe(true)
        expect(isSectionStale(model, 'sampleAllocation')).toBe(true)
    })

    // The same rule one lifecycle later: a stale section recalculated at a different Scale returns rows that
    // happen to be identical. Completion is what settles it - nothing numeric moved to settle it with.
    it('settles a stale recalculation that arrives with a changed Scale', () => {
        const done = throughProportions()
        const stale = {...done, proportions: {...done.proportions, requiresUpdate: true}}

        const recalculated = {...stale, proportions: {...stale.proportions, requiresUpdate: false, scale: 30}}
        expect(proportionValues(recalculated)).toEqual(proportionValues(stale))

        expect(planModelUpdates(stale, recalculated))
            .not.toContainEqual([['proportions', 'requiresUpdate'], true])

        const {model} = settle(stale, recalculated)
        expect(model.proportions.scale).toBe(30)
        expect(!!model.proportions.requiresUpdate).toBe(false)
    })

    // Neither of these previous states is a finished automatic calculation, so neither can make the arriving
    // one stale. Readiness alone cannot see that: it is deliberately true for skipped proportions (an
    // allocation has nothing to wait for) and for answered manual rows (they are finished, by hand).
    it('does not reflag an automatic calculation that replaces manual answers', () => {
        const created = newRecipe()
        const stratified = settle(created, stratificationCompleted(created)).model
        const manual = {
            ...stratified,
            proportions: {skip: false, manual: [true], requiresUpdate: false, scale: SUBMITTED_SCALE, anticipatedProportions: CALCULATED_PROPORTIONS}
        }

        const calculated = {...manual, proportions: {...manual.proportions, manual: [], scale: 30}}
        expect(proportionValues(calculated)).toEqual(proportionValues(manual))

        expect(planModelUpdates(manual, calculated))
            .not.toContainEqual([['proportions', 'requiresUpdate'], true])

        const {model} = settle(manual, calculated)
        expect(model.proportions.scale).toBe(30)
        expect(!!model.proportions.requiresUpdate).toBe(false)
    })

    it('does not reflag an automatic calculation that replaces skipped proportions', () => {
        const created = newRecipe()
        const stratified = settle(created, stratificationCompleted(created)).model
        const skipped = {...stratified, proportions: {skip: true, scale: SUBMITTED_SCALE}}

        const calculated = {
            ...skipped,
            proportions: {skip: false, manual: [], requiresUpdate: false, scale: 30, anticipatedProportions: CALCULATED_PROPORTIONS}
        }

        expect(planModelUpdates(skipped, calculated))
            .not.toContainEqual([['proportions', 'requiresUpdate'], true])

        const {model} = settle(skipped, calculated)
        expect(model.proportions.scale).toBe(30)
        expect(!!model.proportions.requiresUpdate).toBe(false)
    })

    // The counterpart, which must keep holding: a Scale moved on a result that was already finished has no
    // new calculation to justify it, so that result IS stale. Built from a finished section directly rather
    // than from the lifecycle above, so what the planner does with a first submission cannot mask it.
    it('still flags a Scale change made on an already-finished result', () => {
        const created = newRecipe()
        const stratified = settle(created, stratificationCompleted(created)).model
        const finished = proportionsCompleted(stratified)
        const rescaled = {...finished, proportions: {...finished.proportions, scale: 30}}

        expect(actions(finished, rescaled).proportions).toBe('recalculate')
        expect(planModelUpdates(finished, rescaled))
            .toContainEqual([['proportions', 'requiresUpdate'], true])
    })

    it('cannot be cleared by a later proportion change', () => {
        const flagged = throughProportions()
        const edited = withProportions(flagged, CHANGED_PROPORTIONS)
        expect(settle(flagged, edited).model.sampleAllocation.requiresUpdate).toBe(true)
    })

    // An empty design has nothing to allocate over, so there is nothing for the user to do yet. The section
    // becomes actionable when strata exist, not when the recipe is created.
    it('does not flag an allocation before any strata exist', () => {
        const created = newRecipe()
        const relocated = {...created, aoi: {type: 'EE_TABLE', id: 'countries/KEN'}}
        expect(planDerivedUpdates(created, relocated).allocation.requiresUpdate).not.toBe(true)
        expect(settle(created, relocated).model.sampleAllocation?.requiresUpdate).not.toBe(true)
    })

    it('settles silently once a total sample size has been supplied', () => {
        const flagged = throughProportions()
        const targeted = {...flagged, sampleAllocation: {...flagged.sampleAllocation, sampleSize: 100, allocationStrategy: 'BALANCED'}}
        const {model} = settle(targeted, withStrata(targeted, SHIFTED_WEIGHTS))
        expect(isSectionStale(model, 'sampleAllocation')).toBe(false)
        expect(model.sampleAllocation.allocation.map(({sampleSize}) => sampleSize)).toEqual([50, 50])
    })

    it('leaves a fully configured automatic allocation recalculating on its own', () => {
        const configured = strategy(base, 'BALANCED')
        const {model} = settle(configured, withStrata(configured, SHIFTED_WEIGHTS))
        expect(isSectionStale(model, 'sampleAllocation')).toBe(false)
        expect(model.sampleAllocation.allocation).toEqual([{stratum: 1, sampleSize: 50}, {stratum: 2, sampleSize: 50}])
    })

    // Error mode has its own target: a margin to solve a total from. A new recipe is given one, so this is
    // the recipe that had it cleared, or was saved before it was defaulted.
    it('reports needing input when error mode has no margin of error', () => {
        const created = newRecipe()
        const estimating = {
            ...created,
            sampleAllocation: {...created.sampleAllocation, estimateSampleSize: true, marginOfError: null}
        }
        const stratified = stratificationCompleted(estimating)
        const withReadyProportions = proportionsCompleted(stratified)
        expect(actions(stratified, withReadyProportions).allocation).toBe('needsInput')
        expect(settle(stratified, withReadyProportions).model.sampleAllocation.sampleSize).toBeUndefined()
    })
})
