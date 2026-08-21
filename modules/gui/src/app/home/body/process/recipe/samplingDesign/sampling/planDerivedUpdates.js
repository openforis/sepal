import _ from 'lodash'

import {allocationOutcome, blankAllocation, effectiveAllocationStrategy, effectiveSampleAllocation, isManualAllocation, isPositiveIntegerSampleSize, marginOfErrorFor, reconcileManualAllocation, unansweredStrata} from './allocationOutcome'
import {readsProportions, readsWeights} from './allocationStrategy'
import {getDefaultSampleAllocation} from './defaultModel'
import {isProportionsApplicable, orderedStratumKeys, reconcileManualProportions, stratumKey, unansweredProportions} from './designModel'
import {isValidMarginOfError} from './numericRanges'

// Semantic invalidation for the Sampling Design recipe. Panel order says nothing about what depends on what:
// each derived section is planned from the inputs its own mode actually reads, so a change is only propagated
// where it changes an answer.

// What the anticipated-proportion reduction is evaluated over: the source it reads, the AOI, the CRS, and the
// Scale it runs at - which is the Proportions Scale, concrete configuration of its own. The Stratification
// Scale is deliberately NOT here: it changes how large a stratum turns out, and therefore its weight, but the
// reduction groups by stratum over the same AOI in the same CRS at the same resolution either way, so the
// proportions it produces do not move. Weights are carried separately, where the allocation reads them.
export const stratificationFrame = model => {
    const stratification = model?.stratification || {}
    return {
        aoi: model?.aoi,
        skip: !!stratification.skip,
        type: stratification.type,
        assetId: stratification.assetId,
        recipeId: stratification.recipeId,
        band: stratification.band,
        crs: stratification.crs,
        scale: Number(model?.proportions?.scale)
    }
}

// Identity as a set: manual answers are keyed, so reordering the strata cannot invalidate them.
export const stratumKeySet = model => _.sortBy(_.uniq(orderedStratumKeys(model)))

// Weights, not areas: an area change that leaves every weight where it was changes no allocation - though it
// can still move the derived uncertainty, which reads weights too.
// Keyed and sorted, because a weight belongs to a stratum rather than to a position: reordering the strata
// changes no weight. Order matters to allocation, and is carried by the ordered keys instead.
export const stratumWeights = model =>
    _.sortBy(
        (model?.stratification?.strata || []).map(stratum => ({stratum: stratumKey(stratum), weight: stratum.weight})),
        'stratum'
    )

export {isProportionsApplicable}

export const isProportionsManual = model => !!model?.proportions?.manual?.length

// The proportion values themselves, stripped of the strata snapshot the rows happen to carry. Null when
// proportions do not apply, so switching them off is not read as "every proportion changed".
export const proportionValues = model =>
    isProportionsApplicable(model)
        ? (model?.proportions?.anticipatedProportions || []).map(row =>
            ({stratum: stratumKey(row), proportion: row.proportion}))
        : null

// Whether the proportions a dependent allocation would read are the finished article. Lifecycle, not
// arithmetic: recalculated proportions can land on exactly the numbers they replaced, so a dependent
// allocation that waited for them must be released by THIS becoming true, never by the numbers moving.
// A reconciled-but-unanswered manual row is not readiness either - the row exists so the user can fill it in.
export const proportionsReady = model => {
    if (!isProportionsApplicable(model)) {
        return true
    }
    if (model?.proportions?.requiresUpdate) {
        return false
    }
    return !!proportionValues(model)?.length && !unansweredProportions(model).length
}

export const allocationMode = model => ({
    manual: isManualAllocation(model),
    estimateSampleSize: !!model?.sampleAllocation?.estimateSampleSize,
    allocationStrategy: model?.sampleAllocation?.allocationStrategy
})

// What an automatic allocation is calculated from, beyond the target and the strata. Persisted alongside the
// counts whenever a plan settles one, so a recipe never carries counts it cannot account for.
const CALCULATION_SETTINGS = ['estimateSampleSize', 'allocationStrategy', 'confidenceLevel', 'minSamplesPerStratum', 'powerTuningConstant']

const PENDING_PROPORTIONS = ['recalculate', 'needsInput']

// Everything the plan reads. Presentation is absent by construction, so a label or color edit cannot even
// reach the planner - and the Sync host uses this to decide whether there is anything to plan at all.
export const derivedInputs = model => ({
    frame: stratificationFrame(model),
    keys: orderedStratumKeys(model),
    weights: stratumWeights(model),
    proportionsApplicable: isProportionsApplicable(model),
    proportionsManual: isProportionsManual(model),
    proportionsReady: proportionsReady(model),
    proportions: proportionValues(model)
})

// `requiresUpdate` is section STATE, while a plan describes a TRANSITION, so an action that changes nothing
// must not write the flag: a section left alone by this edit may still be stale from an earlier one. Only an
// action that either creates staleness or resolves it says anything about the flag.
const KEEP = {action: 'keep'}

// The strata are an Earth Engine result over the AOI, so a new AOI makes them stale. An unstratified design
// has no such result: its single synthetic stratum takes its area from the AOI geometry at the export
// boundary, so a new AOI leaves it nothing to recompute and nothing to be stale about.
const planStratification = (previous, next) => {
    if (next?.stratification?.skip) {
        return {action: 'notApplicable', requiresUpdate: false}
    }
    return _.isEqual(previous?.aoi, next?.aoi)
        ? KEEP
        : {action: 'recalculate', requiresUpdate: true}
}

const planProportions = (previous, next) => {
    if (!isProportionsApplicable(next)) {
        return {action: 'notApplicable', requiresUpdate: false}
    }
    const identitiesChanged = !_.isEqual(stratumKeySet(previous), stratumKeySet(next))
    // A manual proportion is a within-stratum judgement: how much of THIS stratum is the target. Nothing
    // about the frame, the AOI or how large the stratum turned out changes what the user meant, so only the
    // identities can invalidate it - and then only the strata nobody has answered for need a person.
    if (isProportionsManual(next)) {
        if (!identitiesChanged) {
            return KEEP
        }
        const anticipatedProportions = reconcileManualProportions(next)
        const unanswered = anticipatedProportions.filter(({proportion}) => proportion == null)
        return {
            action: unanswered.length ? 'needsInput' : 'reconcileManual',
            requiresUpdate: !!unanswered.length,
            anticipatedProportions
        }
    }
    // A calculation that has just finished brings its own inputs with it, so the frame moving across that
    // transition is the result rather than an edit to it. Only a previous finished automatic calculation can
    // be invalidated: readiness alone is deliberately true for skipped and for answered manual proportions,
    // neither of which is one. Lifecycle, not arithmetic - a recalculation can land on the numbers it
    // replaced, so values cannot tell completion from an unchanged edit.
    const previouslyCalculated = isProportionsApplicable(previous)
        && !isProportionsManual(previous)
        && proportionsReady(previous)
    if (!previouslyCalculated && proportionsReady(next)) {
        return {action: 'calculated', requiresUpdate: false}
    }
    return identitiesChanged || !_.isEqual(stratificationFrame(previous), stratificationFrame(next))
        ? {action: 'recalculate', requiresUpdate: true}
        : KEEP
}

// Modes that read proportions, applied to a design that no longer has any. The panel already applies this
// policy when it opens; applying it here means the user is not sent through the panel to do it by hand.
const proportionFreeMode = model => {
    const {estimateSampleSize, allocationStrategy} = allocationMode(model)
    if (!estimateSampleSize && !readsProportions(allocationStrategy)) {
        return null
    }
    return {
        // Error mode solves the total from anticipated uncertainty, which no longer exists; the total it last
        // solved is kept and simply becomes the fixed target.
        estimateSampleSize: false,
        // Resolved against a design that now has no proportions, so a strategy that reads them is replaced by
        // the same default the panel falls back to - the user is not sent through the panel to make a choice
        // the design has already made for them.
        allocationStrategy: effectiveAllocationStrategy({
            allocationStrategy,
            proportionsApplicable: false,
            defaultStrategy: getDefaultSampleAllocation().allocationStrategy
        })
    }
}

// The one thing an automatic allocation cannot derive: the target a person has to give it. Fixed mode needs
// a positive whole-number total to spread over the strata; error mode needs a positive margin to solve a
// total from, and proportions to solve it against.
const missingAllocationTarget = model => {
    const {estimateSampleSize} = allocationMode(model)
    return estimateSampleSize
        ? !isProportionsApplicable(model)
            || !proportionsReady(model)
            || !isValidMarginOfError(model?.sampleAllocation?.marginOfError)
        : !isPositiveIntegerSampleSize(model?.sampleAllocation?.sampleSize)
}

// An allocation with no strata has nothing to allocate over, so there is nothing for the user to supply yet:
// creating a recipe must not light the section up. It becomes actionable when strata exist.
const needsAllocationTarget = model =>
    !!orderedStratumKeys(model).length && missingAllocationTarget(model)

// Not a recalculation. The strata are shown as blank count rows so the panel has something to display, but an
// allocation that cannot be completed without a person is unstarted rather than settled - and saying
// otherwise is what left Retrieve blocking a design whose Allocation button was never lit.
const needsInputAllocation = model => ({
    action: 'needsInput',
    requiresUpdate: true,
    allocation: blankAllocation(model),
    // In fixed mode the margin is derived from counts that no longer exist, so it goes with them. In error
    // mode it is the target the user typed - the very thing being reported as missing or unusable - and
    // erasing it would hand the panel a blank field to fill with a default.
    ...(allocationMode(model).estimateSampleSize ? {} : {marginOfError: null})
})

const planManualAllocation = (previous, next, {proportionsChanged, weightsChanged}) => {
    if (_.isEqual(stratumKeySet(previous), stratumKeySet(next))) {
        // Counts are the user's and stay exactly as entered. The uncertainty they imply is not: it reads
        // weights as well as proportions, so either moving means the displayed margin is no longer the one
        // these counts produce.
        return proportionsChanged || weightsChanged
            ? {action: 'refreshUncertainty', requiresUpdate: false, marginOfError: marginOfErrorFor(next)}
            : KEEP
    }
    const allocation = reconcileManualAllocation({
        allocation: next?.sampleAllocation?.allocation,
        stratumKeys: orderedStratumKeys(next)
    })
    const unanswered = unansweredStrata(allocation)
    return {
        action: unanswered.length ? 'needsInput' : 'reconcileManual',
        requiresUpdate: !!unanswered.length,
        allocation,
        marginOfError: marginOfErrorFor({...next, sampleAllocation: {...next.sampleAllocation, allocation}})
    }
}

const planAutomaticAllocation = (previousModel, nextModel, {proportionsAction, proportionsChanged, weightsChanged}) => {
    // Two models on purpose. `nextModel` is what the recipe actually saved; `effectiveModel` is that plus the
    // values a recipe saved before a field existed never had. The calculation reads the second - the
    // allocator rejects a strategy it was not given, and a model that names none reads as depending on
    // nothing, so it would quietly stop recalculating - while what was saved stays visible, because the gap
    // between the two is itself a reason to recalculate.
    const defaults = getDefaultSampleAllocation()
    const savedStrategy = nextModel?.sampleAllocation?.allocationStrategy
    const sampleAllocation = effectiveSampleAllocation({model: nextModel, defaults})
    const effectiveModel = {...nextModel, sampleAllocation}

    // Every plan that touches the allocation carries the settings it was calculated with, so the model it
    // leaves behind explains its own counts and satisfies the same preflight Retrieve runs. A no-op write is
    // dropped by the caller, so a recipe that already states a setting is never rewritten, and a plan that
    // settles nothing writes nothing at all.
    const settings = _.pick(sampleAllocation, CALCULATION_SETTINGS)
    const planned = plan => ['keep', 'waitForProportions'].includes(plan.action)
        ? plan
        : {...settings, ...plan}

    // A design whose proportions no longer apply, still carrying a mode that reads them: settle it into a
    // valid proportion-free one rather than leaving Retrieve blocked on a panel the user has nothing to
    // decide in. Idempotent - once the mode is proportion-free this cannot fire again.
    const proportionFree = !isProportionsApplicable(nextModel) && proportionFreeMode(effectiveModel)
    if (proportionFree) {
        const normalized = {...effectiveModel, sampleAllocation: {...sampleAllocation, ...proportionFree}}
        return planned(needsAllocationTarget(normalized)
            ? {...needsInputAllocation(normalized), ...proportionFree}
            : {action: 'recalculate', requiresUpdate: false, ...proportionFree, ...allocationOutcome(normalized)})
    }

    const {estimateSampleSize, allocationStrategy} = allocationMode(effectiveModel)
    // Error mode solves the total sample size from anticipated uncertainty, so there it is not the strategy
    // that decides what matters - every strategy reads both weights and proportions.
    const dependsOnWeights = estimateSampleSize || readsWeights(allocationStrategy)
    const dependsOnProportions = estimateSampleSize || readsProportions(allocationStrategy)

    // Recomputing against proportions that are not finished would just produce a second wrong answer. Two
    // ways for them to be unfinished: already flagged in the model, or flagged by THIS transition - the flag
    // is written alongside this plan, so the model does not carry it yet. Waiting is not a reason to ask the
    // user for anything: the proportions section carries the flag, and the release below is what triggers the
    // recompute - no flag cascades between sections.
    const proportionsPending = PENDING_PROPORTIONS.includes(proportionsAction) || !proportionsReady(nextModel)
    if (dependsOnProportions && proportionsPending) {
        return planned({action: 'waitForProportions'})
    }
    // Outranks every transition below. A missing target is not staleness that arithmetic can resolve, so a
    // later weight or proportion move must not report the allocation as settled while it is still absent.
    if (needsAllocationTarget(effectiveModel)) {
        return planned(needsInputAllocation(effectiveModel))
    }
    // Released. The counts were last computed from whatever was current before the wait began, so they are
    // stale even if the arriving proportions are numerically identical to the ones they replaced.
    const released = dependsOnProportions && !proportionsReady(previousModel)
    // Ordered rather than set-wise: remainder adjustment walks the strata in order, so the same strata in a
    // different order can allocate differently.
    const identitiesChanged = !_.isEqual(orderedStratumKeys(previousModel), orderedStratumKeys(nextModel))
    // Counts only ever mean anything for the strategy that produced them, so a strategy the saved model does
    // not name invalidates them exactly as moving the weights they read would. Persisting the effective
    // strategy beside the saved counts would leave the model stating a split it did not produce.
    const strategyChanged = sampleAllocation.allocationStrategy !== savedStrategy
    const staleCounts = released
        || identitiesChanged
        || strategyChanged
        || (dependsOnWeights && weightsChanged)
        || (dependsOnProportions && proportionsChanged)
    if (staleCounts) {
        return planned({action: 'recalculate', requiresUpdate: false, ...allocationOutcome(effectiveModel)})
    }
    return planned(proportionsChanged || weightsChanged
        ? {action: 'refreshUncertainty', requiresUpdate: false, marginOfError: marginOfErrorFor(effectiveModel)}
        : KEEP)
}

// Plans what each derived section must do to become correct again for the model it is now part of. Every
// action that can be settled by pure arithmetic carries its result, so the caller has nothing left to
// compute and `requiresUpdate` is left for the two things a plan genuinely cannot settle: Earth Engine work,
// and a number only a person can supply.
export const planDerivedUpdates = (previousModel, nextModel) => {
    const proportions = planProportions(previousModel, nextModel)
    // The plan's own reconciliation of manual proportions must not read as fresh input to the allocation: it
    // is planned against the model BEFORE that write, where an unanswered row still means "not ready".
    const changes = {
        proportionsAction: proportions.action,
        proportionsChanged: !_.isEqual(proportionValues(previousModel), proportionValues(nextModel)),
        weightsChanged: !_.isEqual(stratumWeights(previousModel), stratumWeights(nextModel))
    }
    const allocation = isManualAllocation(nextModel)
        ? planManualAllocation(previousModel, nextModel, changes)
        : planAutomaticAllocation(previousModel, nextModel, changes)
    return {
        stratification: planStratification(previousModel, nextModel),
        proportions,
        allocation
    }
}

const ALLOCATION_WRITES = ['allocation', 'sampleSize', 'marginOfError', ...CALCULATION_SETTINGS]

// The plan as model writes: `[[path, value], ...]` relative to the recipe model, carrying only the entries
// that would actually change something. Empty when no semantic input moved - which is what keeps applying a
// plan from producing another one, since everything written here (counts, the total, the mode, the derived
// margin, the flags) is an output rather than an input.
export const planModelUpdates = (previousModel, nextModel) => {
    if (_.isEqual(derivedInputs(previousModel), derivedInputs(nextModel))) {
        return []
    }
    const {stratification, proportions, allocation} = planDerivedUpdates(previousModel, nextModel)
    const changes = []
    const setValue = (path, value) =>
        _.isEqual(_.get(nextModel, path), value) || changes.push([path, value])
    // An absent flag means the plan has nothing to say about staleness, so the section keeps whatever it
    // already carried - a plan describes one transition, not the whole history of the recipe.
    const setFlag = (section, requiresUpdate) =>
        requiresUpdate === undefined
            || !!_.get(nextModel, [section, 'requiresUpdate']) === requiresUpdate
            || changes.push([[section, 'requiresUpdate'], requiresUpdate])

    setFlag('stratification', stratification.requiresUpdate)
    setFlag('proportions', proportions.requiresUpdate)
    setFlag('sampleAllocation', allocation.requiresUpdate)
    if ('anticipatedProportions' in proportions) {
        setValue(['proportions', 'anticipatedProportions'], proportions.anticipatedProportions)
    }
    ALLOCATION_WRITES
        .filter(key => key in allocation)
        .forEach(key => setValue(['sampleAllocation', key], allocation[key]))
    return changes
}
