import {isValidStratumSampleSize} from './minSamples.js'

// Allocation-validity decisions shared by the GUI Retrieve preflight and the task preflight, so they agree.
// Pure: each caller builds its own error/message.

const stratumOf = row => Number(row?.stratum ?? row?.value)

const configuredStrata = model => (model?.stratification?.strata || []).map(stratumOf)

export const belowStatisticalMinimum = allocation =>
    (allocation || []).filter(({sampleSize}) => !isValidStratumSampleSize(sampleSize))

// Rows that clear the statistical floor but fall below the effective configured minimum (so this never
// double-reports a row already caught by belowStatisticalMinimum).
export const belowConfiguredMinimum = (allocation, effectiveMinimum) =>
    (allocation || []).filter(({sampleSize}) =>
        isValidStratumSampleSize(sampleSize) && Number(sampleSize) < effectiveMinimum)

// {missing, duplicate, unexpected} strata when the allocation does not cover the configured strata one-to-one,
// else null. Structural emptiness is left to the callers' own noStrata / noAllocation checks.
export const allocationStrataMismatch = model => {
    const configured = configuredStrata(model)
    const rows = (model?.sampleAllocation?.allocation || []).map(stratumOf)
    if (!configured.length || !rows.length) {
        return null
    }
    const configuredSet = new Set(configured)
    const rowSet = new Set(rows)
    const missing = configured.filter(stratum => !rowSet.has(stratum))
    const unexpected = [...new Set(rows.filter(stratum => !configuredSet.has(stratum)))]
    const duplicate = [...new Set(rows.filter((stratum, index) => rows.indexOf(stratum) !== index))]
    return missing.length || unexpected.length || duplicate.length
        ? {missing, duplicate, unexpected}
        : null
}
