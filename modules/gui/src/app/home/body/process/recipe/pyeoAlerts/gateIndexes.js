import {baselineSuppliesIndex, GATE_INDEXES, monitoringSuppliesIndex} from '#sepal/recipe/type/pyeoAlerts'

// The indexes PyEO's drop gate offers (GATE_INDEXES) that it can read, by the rules readiness judges the applied gate by
// (lib/js/shared/src/recipe/type/pyeoAlerts.js): computed by the monitoring scenes and supplied by the Classification's
// input, `baseline` being {type, bands} or null while not known. What is not known rules nothing out.

export const readableGateIndexes = (model, baseline) => GATE_INDEXES.filter(index =>
    monitoringSuppliesIndex(model, index) !== false && baselineSuppliesIndex(baseline, index) !== false
)

// NDVI where the gate can read it, otherwise the first index it can: null where it can read none.
export const preferredGateIndex = (model, baseline) => {
    const readable = readableGateIndexes(model, baseline)
    return readable.includes('ndvi') ? 'ndvi' : readable[0] || null
}
