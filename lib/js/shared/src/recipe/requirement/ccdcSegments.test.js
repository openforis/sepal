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
    SLICEABLE_SEGMENTS
} from './ccdcSegments.js'
import {NEEDS_EVIDENCE, SUPPORTED} from './verdict.js'

describe('segments a slicer can cut at a date', () => {
    it('are segments stored with the layout the slicer reads', () => {
        expect(SLICEABLE_SEGMENTS.evaluate(asset(VALID))).toEqual({status: SUPPORTED, measures: ['ndvi']})
    })

    it('include every measure of a real legacy CCDC asset', () => {
        const bands = [
            ...SEGMENT_BANDS.map(name => band(name, 1)),
            ...MEASURES.flatMap(measure => [band(`${measure}_coefs`, 2), band(`${measure}_rmse`, 1), band(`${measure}_magnitude`, 1)])
        ]

        expect(SLICEABLE_SEGMENTS.evaluate(asset(bands))).toEqual({status: SUPPORTED, measures: MEASURES})
    })

    it('are not an asset missing the time bands, as one with a lone RMSE band', () => {
        expect(SLICEABLE_SEGMENTS.evaluate(asset([band('x_rmse', 1)])).diagnostic).toMatchObject({
            code: INCOMPATIBLE_SEGMENT_STRUCTURE, assetId: ASSET_ID, missing: ['tStart', 'tEnd']
        })
    })

    it('are not bands named like segments that are scalars', () => {
        const scalars = ['tStart', 'tEnd', 'ndvi_coefs', 'ndvi_rmse'].map(name => band(name, 0))

        expect(SLICEABLE_SEGMENTS.evaluate(asset(scalars)).diagnostic.wrongDimensions).toEqual([
            {band: 'tStart', expected: 1, actual: 0},
            {band: 'tEnd', expected: 1, actual: 0},
            {band: 'ndvi_coefs', expected: 2, actual: 0},
            {band: 'ndvi_rmse', expected: 1, actual: 0}
        ])
    })

    it('are not segments beside a scalar band the slicer would reach', () => {
        expect(SLICEABLE_SEGMENTS.evaluate(asset([...VALID, band('ndvi_intercept', 0)])).diagnostic).toMatchObject({
            code: INCOMPATIBLE_SEGMENT_STRUCTURE, wrongDimensions: [{band: 'ndvi_intercept', expected: 1, actual: 0}]
        })
    })

    it('are not established, rather than incompatible, where the metadata states no rank', () => {
        const unstated = VALID.map(({name}) => band(name, undefined))

        expect(SLICEABLE_SEGMENTS.evaluate(asset(unstated)).diagnostic).toMatchObject({
            code: INSUFFICIENT_SEGMENT_EVIDENCE, undetermined: VALID.map(({name}) => name)
        })
    })

    it('need a measure that can be evaluated, coefficients with their RMSE', () => {
        expect(SLICEABLE_SEGMENTS.evaluate(asset(without(VALID, 'ndvi_rmse'))).diagnostic.code).toBe(NO_SEGMENT_MEASURE)
    })

    it('need nothing of the chart\'s bands', () => {
        expect(SLICEABLE_SEGMENTS.evaluate(asset(TIME_AND_FIT)).status).toBe(SUPPORTED)
    })

    it('are what a computing recipe fits, by its own declaration', () => {
        expect(SLICEABLE_SEGMENTS.evaluate(computed(['red', 'nir']))).toEqual({status: SUPPORTED, measures: ['red', 'nir']})
    })

    it('cannot be judged without facts', () => {
        expect(SLICEABLE_SEGMENTS.evaluate(null)).toEqual({status: NEEDS_EVIDENCE})
    })
})

describe('the measure a consumer monitors', () => {
    it('is supplied where the segments fit it', () => {
        expect(MONITORED_MEASURE.evaluate(asset(VALID), {measure: 'ndvi'}).status).toBe(SUPPORTED)
    })

    it('is absent where they fit others, naming them', () => {
        expect(MONITORED_MEASURE.evaluate(computed(['vv', 'vh']), {measure: 'ndvi'}).diagnostic)
            .toEqual({code: MONITORED_MEASURE_ABSENT, measure: 'ndvi', measures: ['vv', 'vh']})
    })

    it('asks nothing when none is configured', () => {
        expect(MONITORED_MEASURE.evaluate(computed(['vv']), {measure: null}).status).toBe(SUPPORTED)
    })

    // Whichever is configured, it can only be one the monitoring data observes.
    it('is unobserved where the monitoring data observes none of their measures, naming them', () => {
        expect(MONITORED_MEASURE.evaluate(computed(['VV']), {measure: null, observed: ['ndvi', 'nbr']}).diagnostic)
            .toEqual({code: NO_OBSERVED_MEASURE, measures: ['VV']})
    })

    it('is unobserved where the monitoring data does not observe it, naming the measures it does', () => {
        expect(MONITORED_MEASURE.evaluate(computed(['ndvi', 'VV']), {measure: 'ndvi', observed: ['VV', 'VH']}).diagnostic)
            .toEqual({code: MONITORED_MEASURE_UNOBSERVED, measure: 'ndvi', measures: ['VV']})
    })

    it('names, where it is absent, the measures the monitoring data observes', () => {
        expect(MONITORED_MEASURE.evaluate(computed(['VV', 'ndvi']), {measure: 'nbr', observed: ['ndvi', 'nbr']}).diagnostic)
            .toEqual({code: MONITORED_MEASURE_ABSENT, measure: 'nbr', measures: ['ndvi']})
    })
})

// Narrowing from any data that could be monitored, to the kind of data chosen, to the data chosen: the widest that
// observes none of the segments' measures is the one refused.
describe('the measures segments could be monitored by', () => {
    it('are none where no data that could be monitored observes any of them, naming them', () => {
        expect(MONITORED_MEASURE.evaluate(computed(['tcw']), {monitorable: ['ndvi', 'VV'], available: ['ndvi'], observed: ['ndvi']}).diagnostic)
            .toEqual({code: NO_MONITORABLE_MEASURE, measures: ['tcw']})
    })

    it('are none for the kind of data chosen where it observes none of them, though other kinds do', () => {
        expect(MONITORED_MEASURE.evaluate(computed(['VV']), {monitorable: ['ndvi', 'VV'], available: ['ndvi', 'nbr'], observed: ['ndvi']}).diagnostic)
            .toEqual({code: NO_AVAILABLE_MEASURE, measures: ['VV']})
    })

    it('are none for the data chosen where other data of its kind observes one', () => {
        expect(MONITORED_MEASURE.evaluate(computed(['redEdge1']), {available: ['ndvi', 'redEdge1'], observed: ['ndvi']}).diagnostic)
            .toEqual({code: NO_OBSERVED_MEASURE, measures: ['redEdge1']})
    })

    it('are some where a measure is observed at every scope, whichever is configured', () => {
        expect(MONITORED_MEASURE.evaluate(asset(VALID), {monitorable: ['ndvi', 'VV'], available: ['ndvi'], observed: ['ndvi']}))
            .toEqual({status: SUPPORTED, measures: ['ndvi']})
    })

    it('leave segments with no measure to the requirement that needs one', () => {
        expect(MONITORED_MEASURE.evaluate(asset(without(VALID, 'ndvi_rmse')), {monitorable: ['VV']}).status).toBe(SUPPORTED)
    })
})

describe('segments a chart can plot', () => {
    it('are the slicer\'s with every segment band, and measures with their magnitude', () => {
        expect(CHARTABLE_SEGMENTS.evaluate(asset(VALID))).toEqual({status: SUPPORTED, measures: ['ndvi']})
    })

    it('are not segments without the break and observation bands the chart plots', () => {
        expect(CHARTABLE_SEGMENTS.evaluate(asset(TIME_AND_FIT)).diagnostic)
            .toMatchObject({code: INCOMPATIBLE_SEGMENT_STRUCTURE, missing: ['tBreak', 'changeProb', 'numObs']})
    })

    it('need a measure with its magnitude', () => {
        expect(CHARTABLE_SEGMENTS.evaluate(asset(without(VALID, 'ndvi_magnitude'))).diagnostic.code).toBe(NO_CHARTABLE_MEASURE)
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
