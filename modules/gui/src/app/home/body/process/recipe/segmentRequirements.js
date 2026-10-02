import {msg} from '~/translate'

import {SEGMENTS} from './segmentCapability'
import {NEEDS_EVIDENCE, SUPPORTED, UNSUPPORTED} from './sourceRequirements'

// Requirements over the CCDC segments a source supplies (segmentCapability.js), each named for what it needs of them.
// Every consumer declares the one it needs; none is applied to a consumer that did not declare it.
//
// A requirement is {capability, evaluate, describe}: `evaluate({assetId, evidence, parameters})` judges the segment
// description an observation accepted (`evidence`) and, for segments read from an asset, that asset (`assetId`), to
// {status: SUPPORTED, measures} | {status: UNSUPPORTED, diagnostic} | {status: NEEDS_EVIDENCE}; `describe(diagnostic)`
// says what a diagnosis means, as {message, details}: a summary naming a few representative problems, and every one.

export const INCOMPATIBLE_SEGMENT_STRUCTURE = 'INCOMPATIBLE_SEGMENT_STRUCTURE'
export const INSUFFICIENT_SEGMENT_EVIDENCE = 'INSUFFICIENT_SEGMENT_EVIDENCE'
export const MONITORED_MEASURE_ABSENT = 'MONITORED_MEASURE_ABSENT'
export const NO_SEGMENT_MEASURE = 'NO_SEGMENT_MEASURE'

export const SEGMENT_TIME_BANDS = ['tStart', 'tEnd']

// Segments a per-pixel slicer can cut at a date and evaluate a measure from, as Change Alerts' does
// (lib/js/ee/src/timeSeries/changeAlertsAlgorithm.js): the segment nearest a date is found from `tStart` and `tEnd`,
// every band of the segments image is masked to that segment - a `_coefs` band as a two-dimensional array, any other as
// a one-dimensional one - and a measure is evaluated from `<measure>_coefs` against `<measure>_rmse`. It does not define
// valid CCDC segments.
//
// Segments read from an asset - selected directly, or named by an asset-backed recipe - are judged from the
// dimensionality reported in the asset metadata for that asset's bands (`typedBands`, ccdc/segmentsAsset.js). A recipe
// computing its segments guarantees the layout by its own declaration, so only the measure is asked of it, from its own
// description. Dimensionality says nothing of how many coefficients an array holds, and an image collection's bands are
// its first member's. A band whose dimensionality was not established is reported as such, never as a scalar.
//
// `parameters.monitoredMeasure` is the measure the consumer evaluates. With none selected yet, one complete measure
// makes the source suitable; whether the operation can run is decided where the measure is.
export const SLICEABLE_MEASURE_SEGMENTS = {
    capability: SEGMENTS,
    evaluate: ({assetId, evidence, parameters: {monitoredMeasure} = {}}) => {
        if (assetId) {
            return evidence?.typedBands?.assetId === assetId
                ? assetSuitability({assetId, bands: evidence.typedBands.bands, monitoredMeasure})
                : {status: NEEDS_EVIDENCE}
        }
        return evidence?.baseBands
            ? measureSuitability({measures: evidence.baseBands.map(({name}) => name), monitoredMeasure})
            : {status: NEEDS_EVIDENCE}
    },
    describe: diagnostic => describeDiagnostic(diagnostic)
}

// An established band of the wrong shape, or a required one absent, is incompatible whatever else is unknown.
const assetSuitability = ({assetId, bands, monitoredMeasure}) => {
    const names = bands.map(({name}) => name)
    const missing = SEGMENT_TIME_BANDS.filter(name => !names.includes(name))
    const wrongDimensions = bands
        .filter(({arrayDimensions}) => arrayDimensions !== undefined)
        .map(({name, arrayDimensions}) => ({band: name, expected: expectedDimensions(name), actual: arrayDimensions}))
        .filter(({expected, actual}) => expected !== actual)
    if (missing.length || wrongDimensions.length) {
        return unsupported({code: INCOMPATIBLE_SEGMENT_STRUCTURE, assetId, missing, wrongDimensions})
    }
    const undetermined = bands.filter(({arrayDimensions}) => arrayDimensions === undefined).map(({name}) => name)
    if (undetermined.length) {
        return unsupported({code: INSUFFICIENT_SEGMENT_EVIDENCE, assetId, undetermined})
    }
    return measureSuitability({measures: completeMeasures(names), monitoredMeasure, assetId})
}

const measureSuitability = ({measures, monitoredMeasure, assetId}) => {
    if (monitoredMeasure) {
        return measures.includes(monitoredMeasure)
            ? {status: SUPPORTED, measures}
            : unsupported({code: MONITORED_MEASURE_ABSENT, ...(assetId && {assetId}), measure: monitoredMeasure, measures})
    }
    return measures.length
        ? {status: SUPPORTED, measures}
        : unsupported({code: NO_SEGMENT_MEASURE, ...(assetId && {assetId})})
}

const expectedDimensions = name => name.endsWith('_coefs') ? 2 : 1

// A measure that can be evaluated: its coefficients paired with the RMSE it is measured against.
const completeMeasures = names => names
    .filter(name => name.endsWith('_coefs'))
    .map(name => name.slice(0, -'_coefs'.length))
    .filter(measure => names.includes(`${measure}_rmse`))

const unsupported = diagnostic => ({status: UNSUPPORTED, diagnostic})

const REPRESENTATIVE = 3

const describeDiagnostic = diagnostic => {
    switch (diagnostic.code) {
        case INCOMPATIBLE_SEGMENT_STRUCTURE: {
            const problems = structureProblems(diagnostic)
            return {
                message: msg('process.source.segments.incompatible', {asset: diagnostic.assetId, problems: representative(problems, '; ')}),
                details: problems
            }
        }
        case INSUFFICIENT_SEGMENT_EVIDENCE:
            return {
                message: msg('process.source.segments.undetermined', {
                    asset: diagnostic.assetId, count: diagnostic.undetermined.length, bands: representative(diagnostic.undetermined)
                }),
                details: diagnostic.undetermined
            }
        case MONITORED_MEASURE_ABSENT:
            return {
                message: msg('process.source.segments.measureAbsent', {
                    measure: diagnostic.measure,
                    measures: representative(diagnostic.measures) || msg('process.source.segments.noMeasures')
                }),
                details: []
            }
        case NO_SEGMENT_MEASURE:
            return {message: msg('process.source.segments.noMeasure'), details: []}
        default:
            return null
    }
}

const structureProblems = ({missing, wrongDimensions}) => [
    ...missing.map(band => msg('process.source.segments.missingBand', {band})),
    ...wrongDimensions.map(({band, expected, actual}) => actual === 0
        ? msg('process.source.segments.scalarBand', {band, expected})
        : msg('process.source.segments.wrongDimensions', {band, expected, actual}))
]

const representative = (items, separator = ', ') => items.length > REPRESENTATIVE
    ? msg('process.source.segments.andMore', {items: items.slice(0, REPRESENTATIVE).join(separator), count: items.length - REPRESENTATIVE})
    : items.join(separator)
