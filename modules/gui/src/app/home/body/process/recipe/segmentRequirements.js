import {
    CHARTABLE_SEGMENTS as CHARTABLE,
    INCOMPATIBLE_SEGMENT_STRUCTURE,
    INSUFFICIENT_SEGMENT_EVIDENCE,
    MONITORED_MEASURE as MONITORED,
    MONITORED_MEASURE_ABSENT,
    MONITORED_MEASURE_UNOBSERVED,
    NO_AVAILABLE_MEASURE,
    NO_CHARTABLE_MEASURE,
    NO_MONITORABLE_MEASURE,
    NO_OBSERVED_MEASURE,
    NO_SEGMENT_MEASURE,
    SLICE_SOURCE_SEGMENTS as SLICE_SOURCE,
    SLICEABLE_SEGMENTS as SLICEABLE
} from '#sepal/recipe/requirement/ccdcSegments'
import {msg} from '~/translate'

import {SEGMENTS} from './segmentCapability'

// The shared requirements over CCDC segments (lib/js/shared/src/recipe/requirement/ccdcSegments.js) as the GUI reads
// them: the facts each judges come from the segments capability (`SEGMENTS.factsOf`, segmentCapability.js), and what
// a diagnosis means is said here (`describe`), as {message, details}: a summary naming a few representative problems,
// and every one, in the words of what reads the segments.

export const SLICEABLE_SEGMENTS = {...SLICEABLE, capability: SEGMENTS, describe: diagnostic => describeDiagnostic(diagnostic)}
export const MONITORED_MEASURE = {...MONITORED, capability: SEGMENTS, describe: diagnostic => describeDiagnostic(diagnostic)}
export const CHARTABLE_SEGMENTS = {...CHARTABLE, capability: SEGMENTS, describe: diagnostic => describeDiagnostic(diagnostic)}
export const SLICE_SOURCE_SEGMENTS = {
    ...SLICE_SOURCE,
    capability: SEGMENTS,
    describe: diagnostic => describeDiagnostic(diagnostic, {incompatible: 'incompatibleSlice', noMeasure: 'noSliceMeasure'})
}

const REPRESENTATIVE = 3

const describeDiagnostic = (diagnostic, {incompatible = 'incompatible', noMeasure = 'noMeasure'} = {}) => {
    switch (diagnostic.code) {
        case INCOMPATIBLE_SEGMENT_STRUCTURE: {
            const problems = structureProblems(diagnostic)
            return {
                message: msg(`process.source.segments.${incompatible}`, {asset: diagnostic.assetId, problems: representative(problems, '; ')}),
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
        case MONITORED_MEASURE_UNOBSERVED:
            return {
                message: msg('process.source.segments.measureUnobserved', {
                    measure: diagnostic.measure,
                    measures: representative(diagnostic.measures)
                }),
                details: []
            }
        case NO_MONITORABLE_MEASURE:
        case NO_AVAILABLE_MEASURE:
        case NO_OBSERVED_MEASURE:
            return {
                message: msg(`process.source.segments.${UNMONITORED_MESSAGES[diagnostic.code]}`, {measures: representative(diagnostic.measures)}),
                details: []
            }
        case NO_SEGMENT_MEASURE:
            return {message: msg(`process.source.segments.${noMeasure}`), details: []}
        case NO_CHARTABLE_MEASURE:
            return {message: msg('process.source.segments.noChartableMeasure'), details: []}
        default:
            return null
    }
}

const UNMONITORED_MESSAGES = {
    [NO_MONITORABLE_MEASURE]: 'noMonitorableMeasure',
    [NO_AVAILABLE_MEASURE]: 'noAvailableMeasure',
    [NO_OBSERVED_MEASURE]: 'noObservedMeasure'
}

const structureProblems = ({missing, wrongDimensions, misordered = []}) => [
    ...missing.map(band => msg('process.source.segments.missingBand', {band})),
    ...wrongDimensions.map(({band, expected, actual}) => actual === 0
        ? msg('process.source.segments.scalarBand', {band, expected})
        : msg('process.source.segments.wrongDimensions', {band, expected, actual})),
    ...misordered.length ? [msg('process.source.segments.misordered', {measures: misordered.join(', ')})] : []
]

const representative = (items, separator = ', ') => items.length > REPRESENTATIVE
    ? msg('process.source.segments.andMore', {items: items.slice(0, REPRESENTATIVE).join(separator), count: items.length - REPRESENTATIVE})
    : items.join(separator)
