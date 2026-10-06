import {CCDC_SEGMENTS} from '../capability/ccdcSegments.js'
import {NEEDS_EVIDENCE, SUPPORTED, unsupported} from './verdict.js'

// Requirements over the CCDC segments a source supplies, each named for what a consumer reads of them. Pure: a
// requirement judges `evaluate(facts, parameters)`, where `parameters` is plain data and `facts` describe the segments
// of the producer the CCDC_SEGMENTS capability arrives at (discoverProvider.js) - never the selection itself:
//
//   {producer: COMPUTED, measures: [name]}   segments a recipe computes, in the layout CCDC produces by its own
//                                            declaration; which measures it fits is the only fact
//   {producer: ASSET, assetId, bands: [{name, arrayDimensions}]}
//                                            segments stored in an asset, each band with the array rank its metadata
//                                            states - undefined where none was established, which is never a scalar
//
// Without facts the answer is NEEDS_EVIDENCE. Whether the facts are current and authorized for the source selected
// now is the caller's to establish first, whatever supplies them.
//
// Every band of a segments image is masked to one segment as an array - a `_coefs` band two-dimensional, any other
// one-dimensional - so an established rank of the wrong kind is incompatible. Facts do not say how many coefficients an
// array holds, whether the dates are in the representation configured, or anything of an image collection beyond its
// first member.

export const COMPUTED = 'COMPUTED'
export const ASSET = 'ASSET'

export const INCOMPATIBLE_SEGMENT_STRUCTURE = 'INCOMPATIBLE_SEGMENT_STRUCTURE'
export const INSUFFICIENT_SEGMENT_EVIDENCE = 'INSUFFICIENT_SEGMENT_EVIDENCE'
export const MONITORED_MEASURE_ABSENT = 'MONITORED_MEASURE_ABSENT'
export const MONITORED_MEASURE_UNOBSERVED = 'MONITORED_MEASURE_UNOBSERVED'
export const NO_MONITORABLE_MEASURE = 'NO_MONITORABLE_MEASURE'
export const NO_AVAILABLE_MEASURE = 'NO_AVAILABLE_MEASURE'
export const NO_OBSERVED_MEASURE = 'NO_OBSERVED_MEASURE'
export const NO_SEGMENT_MEASURE = 'NO_SEGMENT_MEASURE'
export const NO_CHARTABLE_MEASURE = 'NO_CHARTABLE_MEASURE'

const TIME_BANDS = ['tStart', 'tEnd']
const CHART_SEGMENT_BANDS = [...TIME_BANDS, 'tBreak', 'changeProb', 'numObs']

// Segments a per-pixel slicer can cut at a date and evaluate a measure from, as Change Alerts' does
// (lib/js/ee/src/timeSeries/changeAlertsAlgorithm.js): the segment nearest a date is found from `tStart` and `tEnd`, and
// a measure is evaluated from `<measure>_coefs` against `<measure>_rmse`. At least one such measure; which one a
// consumer monitors is MONITORED_MEASURE's.
export const SLICEABLE_SEGMENTS = {
    id: 'ccdcSegments.sliceable',
    capability: CCDC_SEGMENTS,
    evaluate: facts => judged(facts, {
        bands: TIME_BANDS,
        measures: names => completeMeasures(names, ['_rmse']),
        none: NO_SEGMENT_MEASURE
    })
}

// The measure a consumer is configured to evaluate is one the segments supply, and one the data it monitors observes:
// {measure, observed, available, monitorable}, each a list of measure names, or absent where it is not known or not
// asked. `observed` is what the data chosen observes, `available` what any data of the kind chosen could, and
// `monitorable` what any data the consumer supports could. No measure means nothing configured to check.
//
// Segments with no measure observed at one of these scopes refuse whatever is configured, naming theirs, by the widest
// such scope - the setting to change: NO_MONITORABLE_MEASURE, NO_AVAILABLE_MEASURE, then NO_OBSERVED_MEASURE. A measure
// they lack, or one the data does not observe, is refused naming those it could be instead. Judged by name alone -
// whether the layout can be sliced, or has a measure at all, is SLICEABLE_SEGMENTS'.
export const MONITORED_MEASURE = {
    id: 'ccdcSegments.monitoredMeasure',
    capability: CCDC_SEGMENTS,
    evaluate: (facts, {measure, observed, available, monitorable} = {}) => {
        if (!facts) {
            return {status: NEEDS_EVIDENCE}
        }
        const measures = facts.producer === ASSET
            ? completeMeasures(facts.bands.map(({name}) => name), ['_rmse'])
            : facts.measures
        const [, code] = [[monitorable, NO_MONITORABLE_MEASURE], [available, NO_AVAILABLE_MEASURE], [observed, NO_OBSERVED_MEASURE]]
            .find(([scope]) => scope && measures.length && !measures.some(name => scope.includes(name))) || []
        if (code) {
            return unsupported({code, ...assetOf(facts), measures})
        }
        const observable = observed ? measures.filter(name => observed.includes(name)) : measures
        if (!measure || observable.includes(measure)) {
            return {status: SUPPORTED, measures}
        }
        return unsupported({
            code: measures.includes(measure) ? MONITORED_MEASURE_UNOBSERVED : MONITORED_MEASURE_ABSENT,
            ...assetOf(facts),
            measure,
            measures: observable
        })
    }
}

// Segments a segment chart can plot (ccdc/ccdcGraph.jsx): each segment's span and break from `tStart`, `tEnd`,
// `tBreak` and `changeProb`, its observation count from `numObs`, and a measure's fit from its `_coefs`, with its
// `_rmse` and `_magnitude`. The measures that can be plotted are the ones answered.
export const CHARTABLE_SEGMENTS = {
    id: 'ccdcSegments.chartable',
    capability: CCDC_SEGMENTS,
    evaluate: facts => judged(facts, {
        bands: CHART_SEGMENT_BANDS,
        measures: names => completeMeasures(names, ['_rmse', '_magnitude']),
        none: NO_CHARTABLE_MEASURE
    })
}

// A computed producer guarantees the layout, so only that it fits a measure is asked of it. For an asset, an
// established band of the wrong shape, or a required one absent, is incompatible whatever else is unknown.
const judged = (facts, {bands: required, measures: measuresOf, none}) => {
    if (!facts) {
        return {status: NEEDS_EVIDENCE}
    }
    if (facts.producer !== ASSET) {
        return measured(facts.measures, {none})
    }
    const {assetId, bands} = facts
    const names = bands.map(({name}) => name)
    const missing = required.filter(name => !names.includes(name))
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
    return measured(measuresOf(names), {none, assetId})
}

const measured = (measures, {none, assetId}) =>
    measures.length
        ? {status: SUPPORTED, measures}
        : unsupported({code: none, ...(assetId && {assetId})})

const expectedDimensions = name => name.endsWith('_coefs') ? 2 : 1

// A measure is its coefficients, with every band it is read beside.
const completeMeasures = (names, beside) => names
    .filter(name => name.endsWith('_coefs'))
    .map(name => name.slice(0, -'_coefs'.length))
    .filter(measure => beside.every(suffix => names.includes(`${measure}${suffix}`)))

const assetOf = facts => facts.producer === ASSET ? {assetId: facts.assetId} : {}
