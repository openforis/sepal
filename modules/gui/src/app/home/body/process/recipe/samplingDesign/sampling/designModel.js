// Canonical persisted ownership of a Sampling Design row:
//   stratification.strata              owns the stratum key, label, color, area and weight
//   proportions.anticipatedProportions owns the stratum key and proportion
//   sampleAllocation.allocation        owns the stratum key and sampleSize
//
// Recipes saved before that boundary existed persisted the whole joined row in all three places, so those
// rows must stay readable - but a cached copy must never win over the value its owner holds now. Every
// reader here takes the owner's value first and falls back to a row's own copy ONLY where the owner has
// nothing for that stratum at all.

// Stratification rows key on `value`, allocation and proportion rows on `stratum`. Reading both means a
// lookup cannot miss because the two sides of a join happened to use different shapes - a miss would fall
// through to the row's cached copy and quietly show a value the owner has already replaced.
export const stratumKey = row => Number(row?.stratum ?? row?.value)

export const orderedStratumKeys = model => (model?.stratification?.strata || []).map(stratumKey)

export const byStratumKey = rows => new Map((rows || []).map(row => [stratumKey(row), row]))

export const firstDefined = (...values) => values.find(value => value != null)

// The single owner-first join. Everything that has to show or use a stratum's presentation and weight goes
// through this: the two downstream panels, and the task boundary. The row's own copy is a fallback for a
// stratum the stratification no longer has, never a competitor to a stratification that still has it.
export const stratumView = (strata, row) => {
    const key = stratumKey(row)
    const owner = strata instanceof Map ? strata.get(key) : byStratumKey(strata).get(key)
    return {
        stratum: key,
        label: firstDefined(owner?.label, row?.label, String(key)),
        color: firstDefined(owner?.color, row?.color, '#000000'),
        area: firstDefined(owner?.area, row?.area),
        weight: firstDefined(owner?.weight, row?.weight)
    }
}

// Authoritative on the proportions panel's skip flag - never infer the mode from anticipatedProportions
// truthiness alone, which can be stale or empty across mode switches.
// Whether the design uses anticipated proportions at all - the user's choice, not a lifecycle state. A
// design can have them applicable while its rows are still being calculated; readiness is a separate
// question, answered by the planner, and confusing the two turns a moment with no rows into a permanent
// change of allocation strategy.
export const isProportionsApplicable = model => !model?.proportions?.skip

// Whether proportion values are there to read right now.
export const hasProportions = model =>
    isProportionsApplicable(model) && !!model?.proportions?.anticipatedProportions?.length

// The join every consumer works from: stratification order, stratification presentation and weights, and the
// current proportion. Allocation strategies read `weight` and `proportion` off these rows, so joining here is
// what stops a stale snapshot on a proportion row from driving the allocation.
export const allocationStrata = model => {
    const proportions = byStratumKey(model?.proportions?.anticipatedProportions)
    const strata = model?.stratification?.strata || []
    const withProportions = hasProportions(model)
    return strata.map(stratum => {
        const view = stratumView(strata, stratum)
        const row = {...view, value: view.stratum}
        return withProportions
            ? {...row, proportion: proportions.get(view.stratum)?.proportion}
            : row
    })
}

// New allocation writes carry counts only. A row with no count omits the key rather than inventing a zero: a
// stratum the user has not answered for must read as unanswered, both here and after a JSON round trip.
export const toCountRow = row => {
    const stratum = stratumKey(row)
    return row?.sampleSize == null || row.sampleSize === ''
        ? {stratum}
        : {stratum, sampleSize: row.sampleSize}
}

export const toCountRows = rows => (rows || []).map(toCountRow)

// Manual proportions are rendered from their own rows, so a stratum with no row cannot be answered at all.
// Reconciliation keeps every answer with its stratum, drops vanished ones, and leaves a new stratum's
// proportion ABSENT - a blank the user must fill, not a zero that quietly claims they already did. The rows
// carry no presentation: the table joins that from the stratification, so it cannot go stale here.
export const reconcileManualProportions = model => {
    const existing = byStratumKey(model?.proportions?.anticipatedProportions)
    return orderedStratumKeys(model).map(stratum => {
        const proportion = existing.get(stratum)?.proportion
        return proportion == null ? {stratum} : {stratum, proportion}
    })
}

// Strata whose proportion nobody has supplied yet. Only these justify asking a person for anything.
export const unansweredProportions = model =>
    reconcileManualProportions(model)
        .filter(({proportion}) => proportion == null)
        .map(({stratum}) => stratum)
