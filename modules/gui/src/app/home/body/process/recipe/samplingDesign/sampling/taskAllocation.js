import {selectAllocationView} from './selectors'

// Boundary materializer producing the strict export/task rows the backend samplers consume:
//   {stratum:number, sampleSize:number, area:number, color:string} (+ label, weight, proportion).
//
// The persisted joined-array allocation (model.sampleAllocation.allocation) is AUTHORITATIVE whenever
// it exists. During incremental rewiring, stratification/proportions may already populate
// samplingDesignDerived while sampleAllocation still uses the old form shape (e.g. `manual: []`, which
// is truthy) - in that case the clean selector would wrongly enter manual mode and yield zeroed sizes.
// Only once sampleAllocation no longer persists an allocation array (fully clean) does this fall
// through to the derived view (selectAllocationView). Returns null when neither is available.

const stratumOf = entry => Number(entry.stratum ?? entry.value)

const joinedArrayRows = model => {
    const allocation = model?.sampleAllocation?.allocation
    if (!allocation) {
        return null
    }
    const strata = model?.stratification?.strata || []
    const anticipatedProportions = model?.proportions?.anticipatedProportions || []
    // Match fallback rows by normalized stratum number so '1' and 1 are treated as the same stratum.
    const lookup = (rows, stratum) => rows.find(row => stratumOf(row) === stratum)
    return allocation.map(entry => {
        const stratum = stratumOf(entry)
        return {...lookup(strata, stratum), ...lookup(anticipatedProportions, stratum), ...entry, stratum}
    })
}

const normalizeTaskRow = row => {
    const stratum = stratumOf(row)
    const {area} = row
    return {
        stratum,
        sampleSize: Number(row.sampleSize),
        area: area == null ? area : Number(area),
        color: row.color ?? '#000000',
        label: row.label ?? String(stratum),
        weight: row.weight,
        proportion: row.proportion
    }
}

export const toTaskAllocation = model => {
    const rows = joinedArrayRows(model) || selectAllocationView(model)
    if (!rows) {
        return null
    }
    return rows.map(normalizeTaskRow)
}
