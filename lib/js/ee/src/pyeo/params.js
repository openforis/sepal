// Maps the pyeoAlerts recipe model to what the rest of the pipeline expects: the parameter object
// UoL's runPyeoChangeAlerts takes, and the band list the monitoring collection must carry.
// Pure (no Earth Engine) so it is unit-tested.

const DEFAULTS = {
    minRequiredClassifierDetectionsThreshold: 5,
    minRequiredDeltaIndexDetectionsThreshold: 5
}

// UoL convention: a threshold of -2.0 lets every transition through the index
// gate, i.e. the gate is effectively off.
const INDEX_GATE_OFF_THRESHOLD = -2.0

// The bands the classifier actually references. A mosaic's getBands$() is a *catalogue*, not a request
// list: it offers every supported index unconditionally, including ones the data set cannot produce
// (ebbi needs a thermal band Sentinel-2 lacks). The GUI narrows it with getAvailableIndexes before
// showing it; getCollection$'s select does not, and throws "Band pattern 'ebbi' did not match any
// bands". bandSetSpecs is what classifyImage feeds to addCovariates, so the union of its included
// bands is both narrow enough to be safe and exactly what monitoring has to carry.
export const toClassifierBands = ({bandSetSpecs = []} = {}) => {
    const bands = [...new Set(bandSetSpecs.flatMap(({included = []}) => included))]
    if (!bands.length) {
        throw new Error('pyeoAlerts: the classification input image has no band set specs')
    }
    return bands
}

// Recipes saved before minCumulativeDetections was named still carry minConsecutiveDetections.
export const toUolParams = ({
    changeFromClasses = [],
    changeToClasses = [],
    minCumulativeDetections,
    minConsecutiveDetections,
    minRepeatability = 50,
    minFromDetections = 2,
    minToDetections = 2,
    indexGate
} = {}) => ({
    changeFromClasses,
    changeToClasses,
    minRequiredValidatedDetectionsThreshold: minCumulativeDetections ?? minConsecutiveDetections ?? 2,
    minRequiredClassifierDetectionsThreshold: DEFAULTS.minRequiredClassifierDetectionsThreshold,
    percentageProbabilityThreshold: minRepeatability,
    minRequiredFromDetectionsThreshold: minFromDetections,
    minRequiredToDetectionsThreshold: minToDetections,
    indexGate: {
        use: !!indexGate,
        index: indexGate ? indexGate.index : 'ndvi',
        threshold: indexGate ? indexGate.threshold : INDEX_GATE_OFF_THRESHOLD,
        minRequiredDeltaIndexDetectionsThreshold: DEFAULTS.minRequiredDeltaIndexDetectionsThreshold
    }
})
