// Boundary materializer producing the strict export/task rows the backend samplers consume:
//   {stratum:number, sampleSize:number, area:number, color:string} (+ label, weight, proportion).
// The persisted joined-array allocation (model.sampleAllocation.allocation) is the production model shape;
// each row is enriched with its stratification and anticipated-proportion fields, matched by stratum number.

const stratumOf = entry => Number(entry.stratum ?? entry.value)

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
    const allocation = model?.sampleAllocation?.allocation
    if (!allocation) {
        return null
    }
    const strata = model?.stratification?.strata || []
    const anticipatedProportions = model?.proportions?.anticipatedProportions || []
    const lookup = (rows, stratum) => rows.find(row => stratumOf(row) === stratum)
    return allocation.map(entry => {
        const stratum = stratumOf(entry)
        return normalizeTaskRow({...lookup(strata, stratum), ...lookup(anticipatedProportions, stratum), ...entry, stratum})
    })
}
