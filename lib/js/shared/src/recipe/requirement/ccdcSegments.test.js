import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {assertMatches} from '#sepal/testSupport/assert'

import {
    ASSET,
    CHARTABLE_SEGMENTS,
    COMPUTED,
    INCOMPATIBLE_SEGMENT_STRUCTURE,
    INSUFFICIENT_SEGMENT_EVIDENCE,
    MONITORED_MEASURE,
    MONITORED_MEASURE_ABSENT,
    MONITORED_MEASURE_UNOBSERVED,
    NO_AVAILABLE_MEASURE,
    NO_CHARTABLE_MEASURE,
    NO_MONITORABLE_MEASURE,
    NO_OBSERVED_MEASURE,
    NO_SEGMENT_MEASURE,
    SLICE_SOURCE_SEGMENTS,
    SLICEABLE_SEGMENTS
} from './ccdcSegments.js'
import {NEEDS_EVIDENCE, SUPPORTED} from './verdict.js'

describe('segments a slicer can cut at a date', () => {
    it('are segments stored with the layout the slicer reads', () => {
        assert.deepEqual(SLICEABLE_SEGMENTS.evaluate(asset(VALID)), {status: SUPPORTED, measures: ['ndvi']})
    })

    it('include every measure of a real legacy CCDC asset', () => {
        const bands = [
            ...SEGMENT_BANDS.map(name => band(name, 1)),
            ...MEASURES.flatMap(measure => [band(`${measure}_coefs`, 2), band(`${measure}_rmse`, 1), band(`${measure}_magnitude`, 1)])
        ]

        assert.deepEqual(SLICEABLE_SEGMENTS.evaluate(asset(bands)), {status: SUPPORTED, measures: MEASURES})
    })

    it('are not an asset missing the time bands, as one with a lone RMSE band', () => {
        assertMatches(SLICEABLE_SEGMENTS.evaluate(asset([band('x_rmse', 1)])).diagnostic, {
            code: INCOMPATIBLE_SEGMENT_STRUCTURE, assetId: ASSET_ID, missing: ['tStart', 'tEnd']
        })
    })

    it('are not bands named like segments that are scalars', () => {
        const scalars = ['tStart', 'tEnd', 'ndvi_coefs', 'ndvi_rmse'].map(name => band(name, 0))

        assert.deepEqual(SLICEABLE_SEGMENTS.evaluate(asset(scalars)).diagnostic.wrongDimensions, [
            {band: 'tStart', expected: 1, actual: 0},
            {band: 'tEnd', expected: 1, actual: 0},
            {band: 'ndvi_coefs', expected: 2, actual: 0},
            {band: 'ndvi_rmse', expected: 1, actual: 0}
        ])
    })

    it('are not segments beside a scalar band the slicer would reach', () => {
        assertMatches(SLICEABLE_SEGMENTS.evaluate(asset([...VALID, band('ndvi_intercept', 0)])).diagnostic, {
            code: INCOMPATIBLE_SEGMENT_STRUCTURE, wrongDimensions: [{band: 'ndvi_intercept', expected: 1, actual: 0}]
        })
    })

    it('are not established, rather than incompatible, where the metadata states no rank', () => {
        const unstated = VALID.map(({name}) => band(name, undefined))

        assertMatches(SLICEABLE_SEGMENTS.evaluate(asset(unstated)).diagnostic, {
            code: INSUFFICIENT_SEGMENT_EVIDENCE, undetermined: VALID.map(({name}) => name)
        })
    })

    it('need a measure that can be evaluated, coefficients with their RMSE', () => {
        assert.equal(SLICEABLE_SEGMENTS.evaluate(asset(without(VALID, 'ndvi_rmse'))).diagnostic.code, NO_SEGMENT_MEASURE)
    })

    it('need nothing of the chart\'s bands', () => {
        assert.equal(SLICEABLE_SEGMENTS.evaluate(asset(TIME_AND_FIT)).status, SUPPORTED)
    })

    it('are what a computing recipe fits, by its own declaration', () => {
        assert.deepEqual(SLICEABLE_SEGMENTS.evaluate(computed(['red', 'nir'])), {status: SUPPORTED, measures: ['red', 'nir']})
    })

    it('cannot be judged without facts', () => {
        assert.deepEqual(SLICEABLE_SEGMENTS.evaluate(null), {status: NEEDS_EVIDENCE})
    })
})

describe('the measure a consumer monitors', () => {
    it('is supplied where the segments fit it', () => {
        assert.equal(MONITORED_MEASURE.evaluate(asset(VALID), {measure: 'ndvi'}).status, SUPPORTED)
    })

    it('is absent where they fit others, naming them', () => {
        assert.deepEqual(MONITORED_MEASURE.evaluate(computed(['vv', 'vh']), {measure: 'ndvi'}).diagnostic, {code: MONITORED_MEASURE_ABSENT, measure: 'ndvi', measures: ['vv', 'vh']})
    })

    it('asks nothing when none is configured', () => {
        assert.equal(MONITORED_MEASURE.evaluate(computed(['vv']), {measure: null}).status, SUPPORTED)
    })

    // Whichever is configured, it can only be one the monitoring data observes.
    it('is unobserved where the monitoring data observes none of their measures, naming them', () => {
        assert.deepEqual(MONITORED_MEASURE.evaluate(computed(['VV']), {measure: null, observed: ['ndvi', 'nbr']}).diagnostic, {code: NO_OBSERVED_MEASURE, measures: ['VV']})
    })

    it('is unobserved where the monitoring data does not observe it, naming the measures it does', () => {
        assert.deepEqual(MONITORED_MEASURE.evaluate(computed(['ndvi', 'VV']), {measure: 'ndvi', observed: ['VV', 'VH']}).diagnostic, {code: MONITORED_MEASURE_UNOBSERVED, measure: 'ndvi', measures: ['VV']})
    })

    it('names, where it is absent, the measures the monitoring data observes', () => {
        assert.deepEqual(MONITORED_MEASURE.evaluate(computed(['VV', 'ndvi']), {measure: 'nbr', observed: ['ndvi', 'nbr']}).diagnostic, {code: MONITORED_MEASURE_ABSENT, measure: 'nbr', measures: ['ndvi']})
    })
})

// Narrowing from any data that could be monitored, to the kind of data chosen, to the data chosen: the widest that
// observes none of the segments' measures is the one refused.
describe('the measures segments could be monitored by', () => {
    it('are none where no data that could be monitored observes any of them, naming them', () => {
        assert.deepEqual(MONITORED_MEASURE.evaluate(computed(['tcw']), {monitorable: ['ndvi', 'VV'], available: ['ndvi'], observed: ['ndvi']}).diagnostic, {code: NO_MONITORABLE_MEASURE, measures: ['tcw']})
    })

    it('are none for the kind of data chosen where it observes none of them, though other kinds do', () => {
        assert.deepEqual(MONITORED_MEASURE.evaluate(computed(['VV']), {monitorable: ['ndvi', 'VV'], available: ['ndvi', 'nbr'], observed: ['ndvi']}).diagnostic, {code: NO_AVAILABLE_MEASURE, measures: ['VV']})
    })

    it('are none for the data chosen where other data of its kind observes one', () => {
        assert.deepEqual(MONITORED_MEASURE.evaluate(computed(['redEdge1']), {available: ['ndvi', 'redEdge1'], observed: ['ndvi']}).diagnostic, {code: NO_OBSERVED_MEASURE, measures: ['redEdge1']})
    })

    it('are some where a measure is observed at every scope, whichever is configured', () => {
        assert.deepEqual(MONITORED_MEASURE.evaluate(asset(VALID), {monitorable: ['ndvi', 'VV'], available: ['ndvi'], observed: ['ndvi']}), {status: SUPPORTED, measures: ['ndvi']})
    })

    it('leave segments with no measure to the requirement that needs one', () => {
        assert.equal(MONITORED_MEASURE.evaluate(asset(without(VALID, 'ndvi_rmse')), {monitorable: ['VV']}).status, SUPPORTED)
    })
})

describe('segments a chart can plot', () => {
    it('are the slicer\'s with every segment band, and measures with their magnitude', () => {
        assert.deepEqual(CHARTABLE_SEGMENTS.evaluate(asset(VALID)), {status: SUPPORTED, measures: ['ndvi']})
    })

    it('are not segments without the break and observation bands the chart plots', () => {
        assertMatches(CHARTABLE_SEGMENTS.evaluate(asset(TIME_AND_FIT)).diagnostic, {code: INCOMPATIBLE_SEGMENT_STRUCTURE, missing: ['tBreak', 'changeProb', 'numObs']})
    })

    it('need a measure with its magnitude', () => {
        assert.equal(CHARTABLE_SEGMENTS.evaluate(asset(without(VALID, 'ndvi_magnitude'))).diagnostic.code, NO_CHARTABLE_MEASURE)
    })
})

describe('segments CCDC Slice derives its bands from', () => {
    it('are segments with every segment band and every measure complete, in one order', () => {
        const bands = [
            ...VALID,
            band('nbr_coefs', 2), band('nbr_rmse', 1), band('nbr_magnitude', 1)
        ]

        assert.deepEqual(SLICE_SOURCE_SEGMENTS.evaluate(asset(bands)), {status: SUPPORTED, measures: ['ndvi', 'nbr']})
    })

    it('are not segments with a measure the chart could plot beside one missing its magnitude', () => {
        const bands = [...VALID, band('nbr_coefs', 2), band('nbr_rmse', 1)]

        assert.equal(CHARTABLE_SEGMENTS.evaluate(asset(bands)).status, SUPPORTED)
        assertMatches(SLICE_SOURCE_SEGMENTS.evaluate(asset(bands)).diagnostic, {code: INCOMPATIBLE_SEGMENT_STRUCTURE, missing: ['nbr_magnitude']})
    })

    it('are not segments with an error band of no measure', () => {
        assertMatches(SLICE_SOURCE_SEGMENTS.evaluate(asset([...VALID, band('x_rmse', 1)])).diagnostic, {code: INCOMPATIBLE_SEGMENT_STRUCTURE, missing: ['x_coefs', 'x_magnitude']})
    })

    it('are not segments whose magnitudes are stored in another order than their errors, which would pair them wrongly', () => {
        const bands = [
            ...SEGMENT_BANDS.map(name => band(name, 1)),
            band('ndvi_coefs', 2), band('nbr_coefs', 2),
            band('ndvi_rmse', 1), band('nbr_rmse', 1),
            band('nbr_magnitude', 1), band('ndvi_magnitude', 1)
        ]

        assertMatches(SLICE_SOURCE_SEGMENTS.evaluate(asset(bands)).diagnostic, {code: INCOMPATIBLE_SEGMENT_STRUCTURE, misordered: ['ndvi', 'nbr']})
    })

    it('are not segments without the break and observation bands every slice reads', () => {
        assertMatches(SLICE_SOURCE_SEGMENTS.evaluate(asset(without(VALID, 'changeProb'))).diagnostic, {code: INCOMPATIBLE_SEGMENT_STRUCTURE, missing: ['changeProb']})
    })

    it('are not established, rather than incompatible, where the metadata states no rank', () => {
        assertMatches(SLICE_SOURCE_SEGMENTS.evaluate(asset([...without(VALID, 'ndvi_rmse'), band('ndvi_rmse', undefined)])).diagnostic, {code: INSUFFICIENT_SEGMENT_EVIDENCE, undetermined: ['ndvi_rmse']})
    })

    it('are not segments of the wrong rank', () => {
        assertMatches(SLICE_SOURCE_SEGMENTS.evaluate(asset([...without(VALID, 'ndvi_coefs'), band('ndvi_coefs', 1)])).diagnostic, {code: INCOMPATIBLE_SEGMENT_STRUCTURE, wrongDimensions: [{band: 'ndvi_coefs', expected: 2, actual: 1}]})
    })

    it('need a measure', () => {
        assert.equal(SLICE_SOURCE_SEGMENTS.evaluate(asset(SEGMENT_BANDS.map(name => band(name, 1)))).diagnostic.code, NO_SEGMENT_MEASURE)
    })

    it('are what a computing recipe fits, by its own declaration', () => {
        assert.deepEqual(SLICE_SOURCE_SEGMENTS.evaluate(computed(['ndvi'])), {status: SUPPORTED, measures: ['ndvi']})
        assert.equal(SLICE_SOURCE_SEGMENTS.evaluate(computed([])).diagnostic.code, NO_SEGMENT_MEASURE)
    })

    it('cannot be judged without facts', () => {
        assert.deepEqual(SLICE_SOURCE_SEGMENTS.evaluate(null), {status: NEEDS_EVIDENCE})
    })
})

const ASSET_ID = 'users/x/segments'
const SEGMENT_BANDS = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']
const MEASURES = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'ndvi', 'ndmi', 'ndwi', 'ndfi', 'nbr']

const band = (name, arrayDimensions) => ({name, arrayDimensions})

const VALID = [
    ...SEGMENT_BANDS.map(name => band(name, 1)),
    band('ndvi_coefs', 2), band('ndvi_rmse', 1), band('ndvi_magnitude', 1)
]

const TIME_AND_FIT = [band('tStart', 1), band('tEnd', 1), band('ndvi_coefs', 2), band('ndvi_rmse', 1)]

const without = (bands, name) => bands.filter(band => band.name !== name)

const asset = bands => ({producer: ASSET, assetId: ASSET_ID, bands})

const computed = measures => ({producer: COMPUTED, measures})
