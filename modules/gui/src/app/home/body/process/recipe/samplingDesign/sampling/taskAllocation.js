import {byStratumKey, firstDefined, stratumKey, stratumView} from './designModel'

// Boundary materializer producing the strict export/task rows the backend samplers consume:
//   {stratum:number, sampleSize:number, area:number, color:string, label, weight, proportion}
// Counts come from the allocation and the proportion from the proportions; everything else comes through the
// same owner-first join the panels display, so neither a legacy joined allocation row nor the strata snapshot
// a proportion row carries can override the current model.

export const toTaskAllocation = model => {
    const allocation = model?.sampleAllocation?.allocation
    if (!allocation) {
        return null
    }
    const strata = byStratumKey(model?.stratification?.strata)
    const proportions = byStratumKey(model?.proportions?.anticipatedProportions)
    return allocation.map(entry => {
        const {stratum, label, color, area, weight} = stratumView(strata, entry)
        return {
            stratum,
            sampleSize: Number(entry.sampleSize),
            area: area == null ? area : Number(area),
            color,
            label,
            weight,
            proportion: firstDefined(proportions.get(stratumKey(entry))?.proportion, entry.proportion)
        }
    })
}
