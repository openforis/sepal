import {allocate} from './allocate'
import {toProportions} from './proportionMath'
import {calculateSampleSize} from './sampleSize'

// Pure selectors over the clean Sampling Design model. Canonical key: `stratum`.
//
// Persisted inputs (panel-owned, via each panel's valuesToModel/modelToValues):
//   stratification:   {skip, type, assetId, recipeId, band, scale, eeStrategy,
//                      legendByStratum: {[stratum]: {label, color}}}
//   proportions:      {skip, manual, anticipationStrategy, percentage,
//                      anticipatedOverallProportion, manualProportionByStratum: {[stratum]: proportion}}
//   sampleAllocation: {manual, estimateSampleSize, confidenceLevel, sampleSize, marginOfError,
//                      relativeMarginOfError, allocationStrategy, minSamplesPerStratum,
//                      powerTuningConstant, manualSampleSizeByStratum: {[stratum]: sampleSize}}
//
// Async EE-derived (orchestrator-owned; never written by panels), flat under samplingDesignDerived:
//   {areaByStratum: {[stratum]: area}, weightByStratum?: {[stratum]: weight},
//    probabilityByStratum: {[stratum]: probability}}
//
// Joined rows are selector OUTPUT only, never persisted truth. Selectors return null when the async
// data they need isn't available yet. Weights are read from the cache if present, else derived from
// areas. Missing legend entries default to label String(stratum) and color '#000000'.

const derived = model => model?.samplingDesignDerived || {}

export const selectStrataView = model => {
    const {areaByStratum, weightByStratum} = derived(model)
    if (!areaByStratum) {
        return null
    }
    const legend = model?.stratification?.legendByStratum || {}
    const totalArea = Object.values(areaByStratum).reduce((sum, area) => sum + area, 0)
    return Object.keys(areaByStratum).map(key => {
        const stratum = Number(key)
        const area = areaByStratum[key]
        return {
            stratum,
            area,
            weight: weightByStratum?.[key] ?? (totalArea ? area / totalArea : 0),
            label: legend[key]?.label ?? String(stratum),
            color: legend[key]?.color ?? '#000000'
        }
    })
}

export const selectProportionView = model => {
    const strata = selectStrataView(model)
    if (!strata) {
        return null
    }
    const proportions = model?.proportions || {}
    if (proportions.manual) {
        const byStratum = proportions.manualProportionByStratum || {}
        return strata.map(stratum => ({...stratum, proportion: byStratum[stratum.stratum] ?? 0}))
    }
    const {probabilityByStratum} = derived(model)
    if (!probabilityByStratum) {
        return null
    }
    const probabilityPerStratum = strata.map(({stratum}) => ({
        stratum,
        probability: probabilityByStratum[stratum] ?? 0
    }))
    // Probabilities with max > 1 are treated as percentages, matching the panel's auto-detection -
    // but as a pure derivation, with no setState side effect.
    const maxProbability = probabilityPerStratum.reduce((max, {probability}) => Math.max(max, probability), 0)
    return toProportions({
        percentage: !!proportions.percentage || maxProbability > 1,
        targetOverallProportion: proportions.anticipatedOverallProportion,
        strata: strata.map(stratum => ({...stratum, value: stratum.stratum})),
        probabilityPerStratum
    })
}

// Allocation needs per-stratum proportions for variance-aware strategies (OPTIMAL/POWER) and for
// sample-size estimation / margin-of-error solving. EQUAL and PROPORTIONAL only need area-derived
// weights, so they work without proportions (e.g. when the proportions panel is skipped).
const requiresProportions = allocation =>
    allocation.estimateSampleSize || allocation.allocationStrategy === 'OPTIMAL' || allocation.allocationStrategy === 'POWER'

export const selectAllocationView = model => {
    const allocation = model?.sampleAllocation || {}
    const proportionsSkipped = !!model?.proportions?.skip
    // Without proportions, allocate over the bare strata view; otherwise over the proportion view.
    const strata = proportionsSkipped ? selectStrataView(model) : selectProportionView(model)
    if (!strata) {
        return null
    }
    if (allocation.manual) {
        const byStratum = allocation.manualSampleSizeByStratum || {}
        return strata.map(stratum => ({...stratum, sampleSize: byStratum[stratum.stratum] ?? 0}))
    }
    const strategy = allocation.allocationStrategy
    const minSamplesPerStratum = allocation.minSamplesPerStratum ?? 0
    const tuningConstant = allocation.powerTuningConstant
    if (proportionsSkipped && requiresProportions(allocation)) {
        // The chosen strategy/estimation can't be evaluated without proportions; surface NaN sizes so
        // validation rejects the design consistently rather than allocating bogus counts.
        return strata.map(stratum => ({...stratum, sampleSize: NaN}))
    }
    const sampleSize = allocation.estimateSampleSize
        ? calculateSampleSize({
            marginOfError: allocation.relativeMarginOfError ? allocation.marginOfError / 100 : allocation.marginOfError,
            relativeMarginOfError: allocation.relativeMarginOfError,
            strategy,
            minSamplesPerStratum,
            tuningConstant,
            confidenceLevel: (allocation.confidenceLevel ?? 0) / 100,
            strata
        })
        : allocation.sampleSize
    if (!Number.isFinite(sampleSize)) {
        // Infeasible (e.g. relative margin of error at zero proportion): surface NaN sample sizes so
        // validation rejects them rather than allocating bogus counts.
        return strata.map(stratum => ({...stratum, sampleSize: NaN}))
    }
    return allocate({sampleSize, strategy, minSamplesPerStratum, tuningConstant, strata})
}
