import _ from 'lodash'

import {getDefaultModel} from './defaultModel'
import {planDerivedUpdates, planModelUpdates, proportionValues} from './planDerivedUpdates'
import {isSectionStale} from './validateRetrieve'

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
// Order matters to the allocation: remainder adjustment walks the strata in order, so the same strata in a
// different order can allocate differently.
const REORDERED = [
    {value: 2, label: 'Non-forest', color: '#a00', area: 700, weight: 0.7},
    {value: 1, label: 'Forest', color: '#0a0', area: 300, weight: 0.3}
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
        // ...but a new AOI makes the strata themselves an outstanding Earth Engine result, so the strata the
        // rows would be reconciled against are not known yet.
        ['manual, AOI changed', manualProportions(base), manualProportions(_.merge({}, base, {aoi: {id: 'countries/KEN'}})), 'recalculate'],
        ['manual, source changed', manualProportions(base), manualProportions(_.merge({}, base, {stratification: {assetId: 'users/x/other'}})), 'keep'],
        // A new stratum has no manual answer, so the panel has to be opened for one.
        ['manual, stratum added', manualProportions(base), manualProportions(withStrata(base, EXTRA_STRATUM)), 'recalculate'],

        // Calculated proportions come out of an Earth Engine reduction over the frame, so the frame and the
        // stratum identities are exactly what they depend on.
        // The reduction runs at the PROPORTIONS Scale, which is concrete configuration. The Stratification
        // Scale changes how large a stratum turns out - its weight - but the reduction still groups by stratum
        // over the same AOI in the same CRS at the same resolution, so the proportions it produces do not move.
        ['calculated, Stratification Scale changed', base, _.merge({}, base, {stratification: {scale: 100}}), 'keep'],
        ['calculated, own Scale changed', _.merge({}, base, {proportions: {scale: 50}}), _.merge({}, base, {proportions: {scale: 80}}), 'keep'],
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

    // Manual proportions are rendered from their own rows, so strata moving underneath them is a change the
    // user has to see. The rows themselves are reconciled by the panel that renders them - Sync never writes
    // a proportion, invented or otherwise.
    it('flags manual proportions when a stratum arrives, without writing a row', () => {
        const previous = manualProportions(base)
        const next = manualProportions(withStrata(base, EXTRA_STRATUM))
        expect(planDerivedUpdates(previous, next).proportions.requiresUpdate).toBe(true)
        expect(planModelUpdates(previous, next).filter(([path]) => path[1] === 'anticipatedProportions')).toEqual([])
    })

    it('flags manual proportions when a stratum goes, without writing a row', () => {
        const previous = manualProportions(base)
        const next = manualProportions(withStrata(base, [base.stratification.strata[0]]))
        expect(planDerivedUpdates(previous, next).proportions.requiresUpdate).toBe(true)
        expect(planModelUpdates(previous, next).filter(([path]) => path[1] === 'anticipatedProportions')).toEqual([])
    })

    // Reordering is not an identity change, so there is nothing to reconcile and nothing to answer.
    it('leaves manual proportions alone when the strata are only reordered', () => {
        const previous = manualProportions(base)
        const next = manualProportions(withStrata(base, [base.stratification.strata[1], base.stratification.strata[0]]))
        expect(planDerivedUpdates(previous, next).proportions.action).toBe('keep')
    })
})

// What an upstream change does to the allocation: it flags it, and nothing else. The counts, the total and
// the derived margin are all numbers a person is expected to look at, so recomputing them underneath a closed
// panel would put an allocation nobody has seen into the recipe. `recalculate` here names the flag, not a
// calculation the planner performs - the Allocation panel does that when it opens.
describe('planDerivedUpdates - allocation invalidation matrix', () => {
    const cases = [
        // Manual counts are the user's and are never recalculated by anyone. The uncertainty they imply is
        // not: it reads weights and proportions, so either moving means the displayed margin no longer
        // belongs to these counts, and the panel has to refresh it.
        ['manual, weights changed', manualAllocation(base), manualAllocation(withStrata(base, SHIFTED_WEIGHTS)), 'recalculate'],
        ['manual, proportions changed', manualAllocation(base), manualAllocation(withProportions(base, CHANGED_PROPORTIONS)), 'recalculate'],
        ['manual, stratum added', manualAllocation(base), manualAllocation(withStrata(base, EXTRA_STRATUM)), 'recalculate'],
        ['manual, areas rescaled', manualAllocation(base), manualAllocation(withStrata(base, RESCALED_AREAS)), 'keep'],
        ['manual, label and color changed', manualAllocation(base), manualAllocation(withStrata(base, RENAMED)), 'keep'],
        ['manual, strata only reordered', manualAllocation(base), manualAllocation(withStrata(base, REORDERED)), 'recalculate'],

        // Fixed total sample size. Every strategy shows a derived margin where proportions apply, so weights
        // reach the panel's output whether or not the strategy's own formula reads them.
        ['fixed EQUAL, weights changed', strategy(base, 'EQUAL'), strategy(withStrata(base, SHIFTED_WEIGHTS), 'EQUAL'), 'recalculate'],
        ['fixed EQUAL, proportions changed', strategy(base, 'EQUAL'), strategy(withProportions(base, CHANGED_PROPORTIONS), 'EQUAL'), 'recalculate'],
        ['fixed EQUAL, stratum added', strategy(base, 'EQUAL'), strategy(withStrata(base, EXTRA_STRATUM), 'EQUAL'), 'recalculate'],
        ['fixed PROPORTIONAL, weights changed', base, withStrata(base, SHIFTED_WEIGHTS), 'recalculate'],
        ['fixed PROPORTIONAL, proportions changed', base, withProportions(base, CHANGED_PROPORTIONS), 'recalculate'],
        ['fixed OPTIMAL, proportions changed', strategy(base, 'OPTIMAL'), strategy(withProportions(base, CHANGED_PROPORTIONS), 'OPTIMAL'), 'recalculate'],

        // A weight change with nothing displayed that reads it: no proportions, so no margin, and a strategy
        // that spreads evenly whatever the strata weigh.
        ['fixed EQUAL without proportions, weights changed',
            skippedProportions(strategy(base, 'EQUAL')),
            skippedProportions(strategy(withStrata(base, SHIFTED_WEIGHTS), 'EQUAL')), 'keep'],
        ['fixed PROPORTIONAL without proportions, weights changed',
            skippedProportions(base), skippedProportions(withStrata(base, SHIFTED_WEIGHTS)), 'recalculate'],

        // Error mode solves the total from anticipated uncertainty, so both reach it in every strategy.
        ['error EQUAL, proportions changed', errorMode(strategy(base, 'EQUAL')), errorMode(strategy(withProportions(base, CHANGED_PROPORTIONS), 'EQUAL')), 'recalculate'],
        ['error EQUAL, weights changed', errorMode(strategy(base, 'EQUAL')), errorMode(strategy(withStrata(base, SHIFTED_WEIGHTS), 'EQUAL')), 'recalculate'],

        // Areas that leave every weight where it was, and presentation, reach no calculation at all.
        ['fixed PROPORTIONAL, areas rescaled', base, withStrata(base, RESCALED_AREAS), 'keep'],
        ['fixed POWER, label and color changed', strategy(base, 'POWER'), strategy(withStrata(base, RENAMED), 'POWER'), 'keep'],
        ['error PROPORTIONAL, label and color changed', errorMode(base), errorMode(withStrata(base, RENAMED)), 'keep'],
        ['fixed PROPORTIONAL, nothing changed', base, base, 'keep']
    ]

    it.each(cases)('%s -> %s', (_name, previous, next, expected) => {
        expect(actions(previous, next).allocation).toBe(expected)
    })

    // The whole point of the flag: whatever moved upstream, the plan carries no allocation output with it.
    it.each(cases)('%s writes no allocation output', (_name, previous, next) => {
        const written = planModelUpdates(previous, next)
            .filter(([path]) => path[0] === 'sampleAllocation')
            .map(([path]) => path[1])
        expect(_.without(written, 'requiresUpdate')).toEqual([])
    })
})

// Sync does not decide a design's mode or fill in its settings. It says the section needs attention; the
// panel resolves defaults, replaces a strategy the design can no longer run, recalculates and persists all of
// it on Apply.
describe('planDerivedUpdates - the allocation panel owns its settings', () => {
    const settingWrites = (previous, next) => planModelUpdates(previous, next)
        .filter(([path]) => path[0] === 'sampleAllocation' && path[1] !== 'requiresUpdate')

    it('flags a design whose proportions went away rather than rewriting its mode', () => {
        const optimal = strategy(base, 'OPTIMAL')
        const skipped = skippedProportions(optimal)
        expect(actions(optimal, skipped).allocation).toBe('recalculate')
        expect(settingWrites(optimal, skipped)).toEqual([])
        expect(skipped.sampleAllocation.allocationStrategy).toBe('OPTIMAL')
    })

    it('flags an error-mode design whose proportions went away', () => {
        const solved = errorMode(base)
        expect(actions(solved, skippedProportions(solved)).allocation).toBe('recalculate')
        expect(settingWrites(solved, skippedProportions(solved))).toEqual([])
    })

    // A recipe saved before a setting existed: the gap is a reason to send the user to the panel, never a
    // reason for Sync to write a default into their recipe.
    it('flags a legacy allocation saved without a strategy, and fills nothing in', () => {
        const {allocationStrategy: _dropped, ...sampleAllocation} = base.sampleAllocation
        const legacy = {...base, sampleAllocation}
        const next = withProportions(legacy, CHANGED_PROPORTIONS)
        expect(actions(legacy, next).allocation).toBe('recalculate')
        expect(settingWrites(legacy, next)).toEqual([])
    })

    it('flags a strategy nobody recognizes without replacing it', () => {
        const unknown = strategy(base, 'NONSENSE')
        const next = withProportions(unknown, CHANGED_PROPORTIONS)
        expect(actions(unknown, next).allocation).toBe('recalculate')
        expect(settingWrites(unknown, next)).toEqual([])
    })

    it('leaves a design that states every setting it runs settled', () => {
        expect(actions(base, withStrata(base, RENAMED)).allocation).toBe('keep')
    })
})

// The target is the one thing an automatic allocation cannot derive. A missing or unusable one is not
// staleness arithmetic can resolve, so the section stays flagged - and the number the user typed is theirs,
// never rewritten.
describe('planDerivedUpdates - a missing allocation target', () => {
    const errorModeTarget = marginOfError =>
        ({...base, sampleAllocation: {...base.sampleAllocation, estimateSampleSize: true, marginOfError}})

    it('flags an error-mode target it cannot use, and leaves it alone', () => {
        const invalid = errorModeTarget(-1)
        const next = withStrata(invalid, SHIFTED_WEIGHTS)
        expect(actions(invalid, next).allocation).toBe('recalculate')
        expect(planModelUpdates(invalid, next).filter(([path]) => path[1] === 'marginOfError')).toEqual([])
    })

    it('flags a fixed-size design with no total', () => {
        const {sampleSize: _none, ...sampleAllocation} = base.sampleAllocation
        const noTarget = {...base, sampleAllocation}
        expect(actions(noTarget, withStrata(noTarget, SHIFTED_WEIGHTS)).allocation).toBe('recalculate')
    })

    it('flags a design whose proportions are not finished yet', () => {
        const waiting = staleProportions(errorMode(base))
        expect(actions(errorMode(base), waiting).allocation).toBe('recalculate')
    })

    // An empty design has nothing to allocate over, so there is nothing for the user to do yet.
    it('does not flag a design with no strata at all', () => {
        const empty = {...base, stratification: {...base.stratification, strata: []}}
        const relocated = {...empty, aoi: {type: 'EE_TABLE', id: 'countries/KEN'}}
        expect(actions(empty, relocated).allocation).toBe('keep')
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

    // Witness: proportions skipped, Proportional allocation, weights changed. The counts the recipe carries
    // are left exactly as they were, and the flag is the only thing written.
    it('flags an allocation whose weights moved without touching its counts', () => {
        const previous = skippedProportions(base)
        const {model, rounds} = settle(previous, skippedProportions(withStrata(base, SHIFTED_WEIGHTS)))
        expect(rounds).toBeLessThanOrEqual(1)
        expect(model.sampleAllocation.allocation).toEqual(previous.sampleAllocation.allocation)
        expect(model.sampleAllocation.requiresUpdate).toBe(true)
    })

    // Witness: an added stratum in manual mode flags the section once, and leaves the counts to the panel.
    it('flags an added stratum in manual mode, once', () => {
        const previous = manualAllocation(base)
        const {model, rounds} = settle(previous, manualAllocation(withStrata(base, EXTRA_STRATUM)))
        expect(rounds).toBeLessThanOrEqual(1)
        expect(model.sampleAllocation.allocation).toEqual(previous.sampleAllocation.allocation)
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

    // Sync invents nothing: a new recipe reaches the Allocation panel with no counts and no total, and the
    // panel is what puts anything there. No counts is the empty list a new recipe starts with.
    it('leaves the allocation empty until its panel is opened', () => {
        const {sampleAllocation} = throughProportions()
        expect(sampleAllocation.allocation).toEqual([])
        expect(sampleAllocation.sampleSize).toBeUndefined()
    })

    it('flags the allocation as soon as the strata arrive', () => {
        const created = newRecipe()
        expect(actions(created, stratificationCompleted(created)).allocation).toBe('recalculate')
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

    // A Proportions Apply is ONE coherent submission: the panel calculated against its own form values, so
    // the Scale, the raw probabilities and the derived rows arrive together and describe each other. Sync
    // does not get to second-guess that - it invalidates Proportions only for upstream changes.
    it('accepts a Proportions submission that carries a changed Scale with its new result', () => {
        const created = newRecipe()
        const stratified = settle(created, stratificationCompleted(created)).model
        const finished = proportionsCompleted(stratified)

        const applied = {
            ...finished,
            proportions: {
                ...finished.proportions,
                scale: 30,
                probabilityPerStratum: [{stratum: 1, probability: 0.55}, {stratum: 2, probability: 0.12}],
                anticipatedProportions: CHANGED_PROPORTIONS,
                requiresUpdate: false
            }
        }

        expect(planModelUpdates(finished, applied))
            .not.toContainEqual([['proportions', 'requiresUpdate'], true])
        expect(settle(finished, applied).model.proportions.requiresUpdate).toBeFalsy()
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

    // An allocation the panel has applied stays settled until something upstream of it moves.
    it('settles once the panel has supplied a total and counts', () => {
        const flagged = throughProportions()
        const applied = {
            ...flagged,
            sampleAllocation: {
                ...flagged.sampleAllocation,
                requiresUpdate: false,
                allocationStrategy: 'BALANCED',
                sampleSize: 100,
                allocation: [{stratum: 1, sampleSize: 40}, {stratum: 2, sampleSize: 60}]
            }
        }
        expect(planModelUpdates(flagged, applied)).toEqual([])
        expect(isSectionStale(applied, 'sampleAllocation')).toBe(false)
    })

    // ...and goes back to requiring attention the moment it does, with its counts left as the panel left them.
    it('flags a settled allocation again when the weights move', () => {
        const configured = strategy(base, 'BALANCED')
        const {model} = settle(configured, withStrata(configured, SHIFTED_WEIGHTS))
        expect(isSectionStale(model, 'sampleAllocation')).toBe(true)
        expect(model.sampleAllocation.allocation).toEqual(configured.sampleAllocation.allocation)
    })

    // Error mode has its own target: a margin to solve a total from. A new recipe is given one, so this is
    // the recipe that had it cleared, or was saved before it was defaulted.
    it('flags error mode that has no margin of error, and supplies no total', () => {
        const created = newRecipe()
        const estimating = {
            ...created,
            sampleAllocation: {...created.sampleAllocation, estimateSampleSize: true, marginOfError: null}
        }
        const stratified = stratificationCompleted(estimating)
        const withReadyProportions = proportionsCompleted(stratified)
        expect(actions(stratified, withReadyProportions).allocation).toBe('recalculate')
        expect(settle(stratified, withReadyProportions).model.sampleAllocation.sampleSize).toBeUndefined()
    })
})

// Each panel owns its configuration AND the output it calculated from that configuration. Sync's job is to
// tell a downstream panel that something it consumes has moved - not to recompute the answer on its behalf
// and quietly accept it. An allocation the user has never seen is not an allocation they approved.
describe('planDerivedUpdates - Sync invalidates downstream rather than calculating', () => {
    // Error mode is the sharpest case: it solves the total sample size from anticipated uncertainty, so a
    // proportion change moves the counts AND the total AND the derived margin - all of it user-visible.
    const readyErrorMode = {
        ...base,
        proportions: {...base.proportions, requiresUpdate: false, scale: 30, anticipatedOverallProportion: 0.3},
        sampleAllocation: {...base.sampleAllocation, estimateSampleSize: true, marginOfError: 50, requiresUpdate: false}
    }

    // What the Proportions panel applies: its own overall-proportion override and the rows it recalculated
    // from it, together, already settled.
    const proportionsApplied = {
        ...readyErrorMode,
        proportions: {
            ...readyErrorMode.proportions,
            anticipatedOverallProportion: 0.5,
            anticipatedProportions: CHANGED_PROPORTIONS,
            requiresUpdate: false
        }
    }

    const allocationWrites = updates =>
        updates.filter(([path]) => path[0] === 'sampleAllocation').map(([path]) => path[1])

    it('flags the allocation instead of recomputing it', () => {
        const updates = planModelUpdates(readyErrorMode, proportionsApplied)
        expect(updates).toContainEqual([['sampleAllocation', 'requiresUpdate'], true])
    })

    // The counts, the total and the margin are the Allocation panel's to produce. Writing them here shows the
    // user numbers nobody asked for, on a panel that never lit up.
    it('writes nothing else to the allocation', () => {
        expect(allocationWrites(planModelUpdates(readyErrorMode, proportionsApplied))).toEqual(['requiresUpdate'])
    })

    it('leaves the allocation stale once the flag is applied', () => {
        const updates = planModelUpdates(readyErrorMode, proportionsApplied)
        const flagged = applyUpdates(proportionsApplied, updates)
        expect(flagged.sampleAllocation.requiresUpdate).toBe(true)
        expect(planModelUpdates(proportionsApplied, flagged)).toEqual([])
    })

    // The other half of ownership: the Allocation panel opens, recalculates, and applies. Upstream has not
    // moved, so Sync neither rewrites what it produced nor flags it again.
    it('accepts the allocation the panel calculated and applied', () => {
        const flagged = applyUpdates(proportionsApplied, planModelUpdates(readyErrorMode, proportionsApplied))
        const allocationApplied = {
            ...flagged,
            sampleAllocation: {
                ...flagged.sampleAllocation,
                requiresUpdate: false,
                sampleSize: 140,
                marginOfError: 44,
                allocation: [{stratum: 1, sampleSize: 52}, {stratum: 2, sampleSize: 88}]
            }
        }

        expect(planModelUpdates(flagged, allocationApplied)).toEqual([])
        expect(allocationApplied.sampleAllocation.requiresUpdate).toBe(false)
    })

    // Coincidence is not agreement: the dependency moved, so the panel still owes the user a look.
    it('flags the allocation even when the recomputed numbers would be identical', () => {
        const identical = {
            ...readyErrorMode,
            proportions: {...readyErrorMode.proportions, anticipatedProportions: [{stratum: 1, proportion: 0.4000001}, {stratum: 2, proportion: 0.1}]}
        }
        expect(planModelUpdates(readyErrorMode, identical))
            .toContainEqual([['sampleAllocation', 'requiresUpdate'], true])
    })

    // Presentation is not a dependency.
    it('ignores a label or colour change', () => {
        expect(planModelUpdates(readyErrorMode, withStrata(readyErrorMode, RENAMED))).toEqual([])
    })
})

// One edit, one plan, every consequence. Sync dispatches a plan as a single action, so a downstream section
// that the same edit invalidates has to be flagged in that action too - not on some later pass, and not only
// when the numbers it reads happen to move. Stale proportions make the allocation's own displayed result
// stale whether or not the rows it was computed from have been recalculated yet.
describe('planDerivedUpdates - invalidation reaches every section in one plan', () => {
    const ready = {
        ...base,
        proportions: {...base.proportions, requiresUpdate: false},
        sampleAllocation: {...base.sampleAllocation, requiresUpdate: false}
    }
    const flags = updates => updates.map(([path, value]) => [path.join('.'), value]).sort()
    const sourceChanged = {...ready, stratification: {...ready.stratification, assetId: 'users/x/other'}}

    it('flags the allocation in the same plan that flags the proportions', () => {
        expect(flags(planModelUpdates(ready, sourceChanged))).toEqual([
            ['proportions.requiresUpdate', true],
            ['sampleAllocation.requiresUpdate', true]
        ])
    })

    // The strata are an Earth Engine result over the AOI, so a new AOI stales all three at once.
    it('flags all three sections when the AOI moves', () => {
        const relocated = {...ready, aoi: {type: 'EE_TABLE', id: 'countries/KEN'}}
        expect(flags(planModelUpdates(ready, relocated))).toEqual([
            ['proportions.requiresUpdate', true],
            ['sampleAllocation.requiresUpdate', true],
            ['stratification.requiresUpdate', true]
        ])
    })

    it('settles after the flags are applied', () => {
        const flagged = applyUpdates(sourceChanged, planModelUpdates(ready, sourceChanged))
        expect(planModelUpdates(sourceChanged, flagged)).toEqual([])
    })

    // Recalculated proportions can land on exactly the numbers they replaced. The allocation was flagged
    // because its input became stale, and only its own panel can clear that.
    it('leaves the allocation flagged when the recalculated proportions are identical', () => {
        const flagged = applyUpdates(sourceChanged, planModelUpdates(ready, sourceChanged))
        const reapplied = {...flagged, proportions: {...flagged.proportions, requiresUpdate: false}}
        expect(planModelUpdates(flagged, reapplied))
            .not.toContainEqual([['sampleAllocation', 'requiresUpdate'], false])
        expect(reapplied.sampleAllocation.requiresUpdate).toBe(true)
    })

    // Manual proportions are a within-stratum judgement: the frame says nothing about what the user meant,
    // so neither section moves.
    it('ignores a frame change for manual proportions', () => {
        const manual = manualProportions(ready)
        expect(planModelUpdates(manual, {...manual, stratification: {...manual.stratification, assetId: 'users/x/other'}}))
            .toEqual([])
    })

    it('flags both when a stratum arrives, even for manual proportions', () => {
        const manual = manualProportions(ready)
        expect(flags(planModelUpdates(manual, manualProportions(withStrata(ready, EXTRA_STRATUM))))).toEqual([
            ['proportions.requiresUpdate', true],
            ['sampleAllocation.requiresUpdate', true]
        ])
    })

    it('writes nothing for a label or colour change', () => {
        expect(planModelUpdates(ready, withStrata(ready, RENAMED))).toEqual([])
    })

    // Skipping proportions reaches the allocation through applicability, and still rewrites nothing.
    it('flags the allocation when proportions are skipped, without touching its mode', () => {
        const skipped = skippedProportions(strategy(ready, 'OPTIMAL'))
        const updates = planModelUpdates(strategy(ready, 'OPTIMAL'), skipped)
        expect(updates).toContainEqual([['sampleAllocation', 'requiresUpdate'], true])
        expect(updates.filter(([path]) => path[0] === 'sampleAllocation' && path[1] !== 'requiresUpdate')).toEqual([])
        expect(skipped.sampleAllocation.allocationStrategy).toBe('OPTIMAL')
    })
})

// Stratification is upstream of everything. While its own result is stale, the strata the recipe still
// carries are the OLD ones - the identities and weights every downstream section reads are about to be
// replaced by numbers nobody has computed yet. Waiting for those numbers to arrive before flagging the
// sections that consume them makes one edit take several sequential passes, and leaves an allocation
// reading superseded strata looking settled in between.
describe('planDerivedUpdates - a stale stratification invalidates its consumers at once', () => {
    const settled = overrides => _.merge({}, base, {
        stratification: {requiresUpdate: false},
        proportions: {requiresUpdate: false},
        sampleAllocation: {requiresUpdate: false}
    }, overrides)
    const relocate = model => ({...model, aoi: {type: 'EE_TABLE', id: 'countries/KEN'}})
    const flags = updates => updates.map(([path, value]) => [path.join('.'), value]).sort()

    // Manual proportions are a within-stratum judgement, and the strata they will have to be judged against
    // are exactly what is being recalculated - so the rows cannot be reconciled until they arrive.
    it('flags manual proportions and a manual allocation when the AOI moves', () => {
        const previous = manualAllocation(manualProportions(settled()))
        expect(flags(planModelUpdates(previous, relocate(previous)))).toEqual([
            ['proportions.requiresUpdate', true],
            ['sampleAllocation.requiresUpdate', true],
            ['stratification.requiresUpdate', true]
        ])
    })

    // Skipped proportions have nothing to recompute, so they stay unflagged - but the allocation still reads
    // the stratum identities, so it does not.
    it('flags the allocation but not skipped proportions when the AOI moves', () => {
        const previous = skippedProportions(settled())
        const updates = planModelUpdates(previous, relocate(previous))
        expect(flags(updates)).toEqual([
            ['sampleAllocation.requiresUpdate', true],
            ['stratification.requiresUpdate', true]
        ])
        expect(updates).not.toContainEqual([['proportions', 'requiresUpdate'], true])
    })

    it.each([
        ['manual proportions and allocation', manualAllocation(manualProportions(settled()))],
        ['skipped proportions', skippedProportions(settled())],
        ['automatic proportions', settled()]
    ])('writes no value of any kind for %s', (_name, previous) => {
        planModelUpdates(previous, relocate(previous))
            .forEach(([path]) => expect(path[1]).toBe('requiresUpdate'))
    })

    it.each([
        ['manual proportions and allocation', manualAllocation(manualProportions(settled()))],
        ['skipped proportions', skippedProportions(settled())],
        ['automatic proportions', settled()]
    ])('settles once the flags are applied for %s', (_name, previous) => {
        const relocated = relocate(previous)
        const flagged = applyUpdates(relocated, planModelUpdates(previous, relocated))
        expect(planModelUpdates(relocated, flagged)).toEqual([])
    })

    // Recalculated strata can land on exactly the identities and weights they replaced. The downstream flags
    // were raised because their input became unknown, and only their own panels can clear them.
    it('leaves downstream flags raised when the recalculated strata are identical', () => {
        const previous = manualAllocation(manualProportions(settled()))
        const relocated = relocate(previous)
        const flagged = applyUpdates(relocated, planModelUpdates(previous, relocated))
        const stratificationApplied = _.merge({}, flagged, {stratification: {requiresUpdate: false}})

        const updates = planModelUpdates(flagged, stratificationApplied)
        expect(updates.filter(([, value]) => value === false)).toEqual([])
        expect(stratificationApplied.proportions.requiresUpdate).toBe(true)
        expect(stratificationApplied.sampleAllocation.requiresUpdate).toBe(true)
    })

    // The counterpart: a Stratification Apply that carries fresh strata is not an unresolved result. What it
    // changed decides what it invalidates, exactly as before.
    it('keeps its selectivity for a submission whose identities and weights did not move', () => {
        const previous = settled()
        expect(planModelUpdates(previous, withStrata(previous, RENAMED))).toEqual([])
    })

    it('still flags the sections a submission with new weights actually moves', () => {
        const previous = settled()
        expect(flags(planModelUpdates(previous, withStrata(previous, SHIFTED_WEIGHTS)))).toEqual([
            ['sampleAllocation.requiresUpdate', true]
        ])
    })

    // Unstratified: the single synthetic stratum takes its area from the AOI geometry at the export boundary,
    // so a new AOI leaves no Earth Engine result to invalidate.
    it('does not flag an unstratified stratification when the AOI moves', () => {
        const unstratified = _.merge({}, settled(), {stratification: {skip: true}})
        expect(planModelUpdates(unstratified, relocate(unstratified)))
            .not.toContainEqual([['stratification', 'requiresUpdate'], true])
    })
})
