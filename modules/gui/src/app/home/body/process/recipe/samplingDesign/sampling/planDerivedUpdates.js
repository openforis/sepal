import _ from 'lodash'

import {effectiveSampleAllocation, isManualAllocation, isPositiveIntegerSampleSize, unansweredStrata} from './allocationOutcome'
import {readsWeights} from './allocationStrategy'
import {getDefaultSampleAllocation} from './defaultModel'
import {isProportionsApplicable, orderedStratumKeys, stratumKey, unansweredProportions} from './designModel'
import {isValidMarginOfError} from './numericRanges'

// Semantic invalidation for the Sampling Design recipe, and nothing else. Every derived section is owned by
// the panel that calculates it: the panel calculates against its own form values and Apply persists the
// configuration and the result together. All this decides is which sections one edit has made stale, so that
// the user is sent to the panels that now need a look - it calculates nothing, normalizes nothing, and
// accepts nothing on a panel's behalf.
//
// Panel order says nothing about what depends on what: each section is planned from the inputs it actually
// reads, so a change is only propagated where it changes an answer.

// The UPSTREAM inputs the anticipated-proportion reduction is evaluated over: the categorical source it
// reads, the AOI and the CRS. Proportions' own settings - its Scale, its property source, its strategy - are
// deliberately absent: they belong to the panel that calculated with them, and arrive with the result they
// produced. The Stratification Scale is absent too: it changes how large a stratum turns out, and therefore
// its weight, but the reduction groups by stratum over the same AOI in the same CRS either way. Weights are
// carried separately, where the allocation reads them.
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

// What an automatic allocation is calculated from, beyond the target and the strata. A recipe that does not
// state all of them cannot account for its own counts, which is a reason to send the user to the panel - the
// panel resolves them from the defaults and persists them on Apply.
const CALCULATION_SETTINGS = ['estimateSampleSize', 'allocationStrategy', 'confidenceLevel', 'minSamplesPerStratum', 'powerTuningConstant']

// Everything the plan reads. Presentation is absent by construction, so a label or color edit cannot even
// reach it - and the Sync host uses this to decide whether there is anything to plan at all.
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

const planProportions = (previous, next, {stratificationInvalidated}) => {
    if (!isProportionsApplicable(next)) {
        return {action: 'notApplicable', requiresUpdate: false}
    }
    // Strata that are about to be recalculated are strata nobody knows yet: the rows the panel will have to
    // produce or reconcile are per-stratum, so neither mode can settle against the ones still in the model.
    if (stratificationInvalidated) {
        return {action: 'recalculate', requiresUpdate: true}
    }
    const identitiesChanged = !_.isEqual(stratumKeySet(previous), stratumKeySet(next))
    // A manual proportion is a within-stratum judgement: how much of THIS stratum is the target. Nothing
    // about the frame, the AOI or how large the stratum turned out changes what the user meant, so only the
    // identities can invalidate it - and the panel reconciles the rows when it opens.
    if (isProportionsManual(next)) {
        return identitiesChanged
            ? {action: 'recalculate', requiresUpdate: true}
            : KEEP
    }
    // Everything a Proportions Apply carries - the Scale, the source, the strategy, the raw probabilities and
    // the rows derived from them - is one coherent submission from the panel that calculated it. Only an
    // upstream move invalidates it.
    return identitiesChanged || !_.isEqual(stratificationFrame(previous), stratificationFrame(next))
        ? {action: 'recalculate', requiresUpdate: true}
        : KEEP
}

// The one thing an automatic allocation cannot derive: the target a person has to give it. Fixed mode needs a
// positive whole-number total to spread over the strata; error mode needs a positive margin to solve a total
// from, and finished proportions to solve it against.
const missingAllocationTarget = model => {
    const {estimateSampleSize} = allocationMode(model)
    return estimateSampleSize
        ? !isProportionsApplicable(model)
            || !proportionsReady(model)
            || !isValidMarginOfError(model?.sampleAllocation?.marginOfError)
        : !isPositiveIntegerSampleSize(model?.sampleAllocation?.sampleSize)
}

// Whether the allocation the recipe carries is one the Allocation panel would accept as it stands. Anything
// else - blank or mismatched rows, a missing total or margin, a setting a recipe saved before the field
// existed, a strategy this design has no proportions to run - is resolved by that panel when it opens, and
// until then the section requires attention. Sync neither fills those in nor decides them.
const allocationSettled = model => {
    const allocation = model?.sampleAllocation?.allocation || []
    const rowsMatchStrata = _.isEqual(allocation.map(stratumKey), orderedStratumKeys(model))
    if (!rowsMatchStrata || unansweredStrata(allocation).length) {
        return false
    }
    if (isManualAllocation(model)) {
        return true
    }
    if (missingAllocationTarget(model)) {
        return false
    }
    const saved = model?.sampleAllocation || {}
    const effective = effectiveSampleAllocation({model, defaults: getDefaultSampleAllocation()})
    return _.isEqual(_.pick(effective, CALCULATION_SETTINGS), _.pick(saved, CALCULATION_SETTINGS))
}

// The allocation is the one section whose result is a set of numbers a person is expected to look at, so an
// upstream move flags it rather than being quietly recomputed underneath them: counts, the total sample size
// and the derived margin of error are all user-visible, and an allocation nobody has seen is not one anybody
// approved. Sync's whole job here is to say "open this panel".
//
// Manual counts are the user's and are never recalculated by anyone - but the uncertainty they imply reads
// weights and proportions, so those still flag the section for its panel to refresh.
const planAllocation = (previousModel, nextModel, {proportionsChanged, proportionsInvalidated, stratificationInvalidated, weightsChanged}) => {
    // An empty design has nothing to allocate over, so there is nothing for the user to do yet. The section
    // becomes actionable when strata exist, not when the recipe is created.
    if (!orderedStratumKeys(nextModel).length) {
        return KEEP
    }
    // Ordered rather than set-wise: remainder adjustment walks the strata in order, so the same strata in a
    // different order can allocate differently.
    const identitiesChanged = !_.isEqual(orderedStratumKeys(previousModel), orderedStratumKeys(nextModel))
    const applicabilityChanged = isProportionsApplicable(previousModel) !== isProportionsApplicable(nextModel)
    const {estimateSampleSize, allocationStrategy, manual} = allocationMode(nextModel)
    // A weight change is visible whenever something displayed reads it: the derived margin (which exists only
    // where proportions do), the solved total, or a strategy that spreads by weight.
    const weightsVisible = isProportionsApplicable(nextModel)
        || estimateSampleSize
        || (!manual && readsWeights(allocationStrategy))
    return identitiesChanged
        // The identities the counts are keyed by, and the weights several strategies spread over, are exactly
        // what is being recalculated - whatever the Proportions mode does or does not have to redo.
        || stratificationInvalidated
        || applicabilityChanged
        || proportionsChanged
        // Taken from THIS plan, not from the persisted flag: the proportions the allocation reads have just
        // become stale, so the allocation's own counts and displayed margin are stale with them - and both
        // flags have to be written in the same action, or the allocation is left settled until something
        // else happens to move. Whether the recalculated rows eventually land on the same numbers is not
        // the question; the input stopped being trustworthy the moment the frame moved.
        || proportionsInvalidated
        || (weightsChanged && weightsVisible)
        || !allocationSettled(nextModel)
        ? {action: 'recalculate', requiresUpdate: true}
        : KEEP
}

// Which derived sections one edit has left needing attention. A plan is a set of flags: what a section should
// now contain is for its own panel to calculate, and for the user to apply.
// Planned in dependency order - stratification, then proportions, then allocation - with each step told what
// the ones above it just decided. Those decisions are read from THIS plan rather than from the persisted
// flags, because the flags are written by this same plan: waiting for them would split one edit's
// consequences across several passes, leaving a section reading a superseded result looking settled in
// between.
export const planDerivedUpdates = (previousModel, nextModel) => {
    const stratification = planStratification(previousModel, nextModel)
    const stratificationInvalidated = stratification.requiresUpdate === true
    const proportions = planProportions(previousModel, nextModel, {stratificationInvalidated})
    const allocation = planAllocation(previousModel, nextModel, {
        stratificationInvalidated,
        proportionsInvalidated: proportions.requiresUpdate === true,
        proportionsChanged: !_.isEqual(proportionValues(previousModel), proportionValues(nextModel)),
        weightsChanged: !_.isEqual(stratumWeights(previousModel), stratumWeights(nextModel))
    })
    return {stratification, proportions, allocation}
}

// The plan as model writes: `[[path, value], ...]` relative to the recipe model, carrying only the entries
// that would actually change something. Flags and nothing else: a derived section's output belongs to the
// panel that calculates it, so applying a plan can never produce another one.
export const planModelUpdates = (previousModel, nextModel) => {
    if (_.isEqual(derivedInputs(previousModel), derivedInputs(nextModel))) {
        return []
    }
    const {stratification, proportions, allocation} = planDerivedUpdates(previousModel, nextModel)
    const changes = []
    // An absent flag means the plan has nothing to say about staleness, so the section keeps whatever it
    // already carried - a plan describes one transition, not the whole history of the recipe.
    const setFlag = (section, requiresUpdate) =>
        requiresUpdate === undefined
            || !!_.get(nextModel, [section, 'requiresUpdate']) === requiresUpdate
            || changes.push([[section, 'requiresUpdate'], requiresUpdate])

    setFlag('stratification', stratification.requiresUpdate)
    setFlag('proportions', proportions.requiresUpdate)
    setFlag('sampleAllocation', allocation.requiresUpdate)
    return changes
}
