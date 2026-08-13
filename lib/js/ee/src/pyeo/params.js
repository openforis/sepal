// Maps the pyeoAlerts recipe model.pyeoAlertsOptions to the parameter object expected by
// UoL's runPyeoChangeAlerts. Pure (no Earth Engine) so it is unit-tested.

const DEFAULTS = {
    minRequiredClassifierDetectionsThreshold: 5,
    percentageProbabilityThreshold: 50,
    minRequiredFromDetectionsThreshold: 2,
    minRequiredToDetectionsThreshold: 2,
    minRequiredDeltaIndexDetectionsThreshold: 5
}

// UoL convention: a threshold of -2.0 lets every transition through the index
// gate, i.e. the gate is effectively off.
const INDEX_GATE_OFF_THRESHOLD = -2.0

export const toUolParams = ({
    changeFromClasses = [],
    changeToClasses = [],
    minConsecutiveDetections = 2,
    indexGate
} = {}) => ({
    changeFromClasses,
    changeToClasses,
    minRequiredValidatedDetectionsThreshold: minConsecutiveDetections,
    minRequiredClassifierDetectionsThreshold: DEFAULTS.minRequiredClassifierDetectionsThreshold,
    percentageProbabilityThreshold: DEFAULTS.percentageProbabilityThreshold,
    minRequiredFromDetectionsThreshold: DEFAULTS.minRequiredFromDetectionsThreshold,
    minRequiredToDetectionsThreshold: DEFAULTS.minRequiredToDetectionsThreshold,
    indexGate: {
        use: !!indexGate,
        index: indexGate ? indexGate.index : 'ndvi',
        threshold: indexGate ? indexGate.threshold : INDEX_GATE_OFF_THRESHOLD,
        minRequiredDeltaIndexDetectionsThreshold: DEFAULTS.minRequiredDeltaIndexDetectionsThreshold
    }
})
