import _ from 'lodash'

import {allocationOutcome, isManualAllocation, marginOfErrorFor, reconcileManualAllocation, unansweredStrata} from './allocationOutcome'
import {orderedStratumKeys, reconcileManualProportions, stratumKey, unansweredProportions} from './designModel'

// Semantic invalidation for the Sampling Design recipe. Panel order says nothing about what depends on what:
// each derived section is planned from the inputs its own mode actually reads, so a change is only propagated
// where it changes an answer.

// What the anticipated-proportion reduction is evaluated over. Stratification Scale and its CRS transform are
// deliberately NOT here: they change how large a stratum turns out, and therefore its weight, but the
// reduction groups by stratum over the same AOI in the same CRS either way, so the proportions it produces do
// not move. Weights are carried separately, where the allocation reads them.
export const stratificationFrame = model => {
    const stratification = model?.stratification || {}
    return {
        aoi: model?.aoi,
        skip: !!stratification.skip,
        type: stratification.type,
        assetId: stratification.assetId,
        recipeId: stratification.recipeId,
        band: stratification.band,
        crs: stratification.crs
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

export const isProportionsApplicable = model => !model?.proportions?.skip

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

const WEIGHT_DEPENDENT_STRATEGIES = ['PROPORTIONAL', 'BALANCED', 'OPTIMAL', 'POWER']
const PROPORTION_DEPENDENT_STRATEGIES = ['OPTIMAL', 'POWER']
// The same fallback the panel applies when it opens without proportions - the established policy, restated
// here so it can also be applied while the panel is closed.
const PROPORTION_FREE_STRATEGY = 'BALANCED'
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
    return identitiesChanged || !_.isEqual(stratificationFrame(previous), stratificationFrame(next))
        ? {action: 'recalculate', requiresUpdate: true}
        : KEEP
}

// Modes that read proportions, applied to a design that no longer has any. The panel already applies this
// policy when it opens; applying it here means the user is not sent through the panel to do it by hand.
const proportionFreeMode = model => {
    const {estimateSampleSize, allocationStrategy} = allocationMode(model)
    if (!estimateSampleSize && !PROPORTION_DEPENDENT_STRATEGIES.includes(allocationStrategy)) {
        return null
    }
    return {
        // Error mode solves the total from anticipated uncertainty, which no longer exists; the total it last
        // solved is kept and simply becomes the fixed target.
        estimateSampleSize: false,
        allocationStrategy: PROPORTION_DEPENDENT_STRATEGIES.includes(allocationStrategy)
            ? PROPORTION_FREE_STRATEGY
            : allocationStrategy
    }
}

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

const planAutomaticAllocation = (previous, next, {proportionsAction, proportionsChanged, weightsChanged}) => {
    // A design whose proportions no longer apply, still carrying a mode that reads them: settle it into a
    // valid proportion-free one rather than leaving Retrieve blocked on a panel the user has nothing to
    // decide in. Idempotent - once the mode is proportion-free this cannot fire again.
    const proportionFree = !isProportionsApplicable(next) && proportionFreeMode(next)
    if (proportionFree) {
        const normalized = {...next, sampleAllocation: {...next.sampleAllocation, ...proportionFree}}
        return {action: 'recalculate', requiresUpdate: false, ...proportionFree, ...allocationOutcome(normalized)}
    }

    const {estimateSampleSize, allocationStrategy} = allocationMode(next)
    // Error mode solves the total sample size from anticipated uncertainty, so there it is not the strategy
    // that decides what matters - every strategy reads both weights and proportions.
    const dependsOnWeights = estimateSampleSize || WEIGHT_DEPENDENT_STRATEGIES.includes(allocationStrategy)
    const dependsOnProportions = estimateSampleSize || PROPORTION_DEPENDENT_STRATEGIES.includes(allocationStrategy)

    // Recomputing against proportions that are not finished would just produce a second wrong answer. Two
    // ways for them to be unfinished: already flagged in the model, or flagged by THIS transition - the flag
    // is written alongside this plan, so the model does not carry it yet. Waiting is not a reason to ask the
    // user for anything: the proportions section carries the flag, and the release below is what triggers the
    // recompute - no flag cascades between sections.
    const proportionsPending = PENDING_PROPORTIONS.includes(proportionsAction) || !proportionsReady(next)
    if (dependsOnProportions && proportionsPending) {
        return {action: 'waitForProportions'}
    }
    // Released. The counts were last computed from whatever was current before the wait began, so they are
    // stale even if the arriving proportions are numerically identical to the ones they replaced.
    const released = dependsOnProportions && !proportionsReady(previous)
    // Ordered rather than set-wise: remainder adjustment walks the strata in order, so the same strata in a
    // different order can allocate differently.
    const identitiesChanged = !_.isEqual(orderedStratumKeys(previous), orderedStratumKeys(next))
    const staleCounts = released
        || identitiesChanged
        || (dependsOnWeights && weightsChanged)
        || (dependsOnProportions && proportionsChanged)
    if (staleCounts) {
        return {action: 'recalculate', requiresUpdate: false, ...allocationOutcome(next)}
    }
    return proportionsChanged || weightsChanged
        ? {action: 'refreshUncertainty', requiresUpdate: false, marginOfError: marginOfErrorFor(next)}
        : KEEP
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

const ALLOCATION_WRITES = ['allocation', 'sampleSize', 'marginOfError', 'estimateSampleSize', 'allocationStrategy']

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
