import {describe, expect, it, vi} from 'vitest'

import {typedSegmentsAssetDescription} from './ccdc/segmentsAsset'
import {
    INCOMPATIBLE_SEGMENT_STRUCTURE,
    INSUFFICIENT_SEGMENT_EVIDENCE,
    MONITORED_MEASURE_ABSENT,
    NO_SEGMENT_MEASURE,
    SLICEABLE_MEASURE_SEGMENTS
} from './segmentRequirements'
import {NEEDS_EVIDENCE, SUPPORTED} from './sourceRequirements'

vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))

// Segments a slicer can cut at a date and evaluate a measure from, judged from the description an observation accepts:
// for an asset, its metadata as /assetMetadata answers for it.

describe('segments read from an asset', () => {
    it('suit when its bands have the layout the slicer reads', () => {
        expect(assetSuitability(VALID)).toEqual({status: SUPPORTED, measures: ['ndvi']})
    })

    it('suit for every measure of a real legacy CCDC asset, as Earth Engine answers for it', () => {
        const bands = [
            band('tStart', 1), band('tEnd', 1), band('tBreak', 1), band('numObs', 1), band('changeProb', 1),
            ...MEASURES.flatMap(measure => [band(`${measure}_coefs`, 2), band(`${measure}_rmse`, 1), band(`${measure}_magnitude`, 1)])
        ]

        expect(assetSuitability(bands)).toEqual({status: SUPPORTED, measures: MEASURES})
    })

    it('do not suit when the time bands are missing, as for an asset with a lone RMSE band', () => {
        expect(assetSuitability([band('x_rmse', 1)]).diagnostic).toMatchObject({
            code: INCOMPATIBLE_SEGMENT_STRUCTURE, assetId: ASSET, missing: ['tStart', 'tEnd']
        })
    })

    it('do not suit when the bands named like segments are scalars', () => {
        const scalars = ['tStart', 'tEnd', 'ndvi_coefs', 'ndvi_rmse'].map(name => band(name, 0))

        expect(assetSuitability(scalars).diagnostic.wrongDimensions).toEqual([
            {band: 'tStart', expected: 1, actual: 0},
            {band: 'tEnd', expected: 1, actual: 0},
            {band: 'ndvi_coefs', expected: 2, actual: 0},
            {band: 'ndvi_rmse', expected: 1, actual: 0}
        ])
    })

    it('do not suit when a scalar band beside the segments would reach the slicer', () => {
        expect(assetSuitability([...VALID, band('ndvi_intercept', 0)]).diagnostic).toMatchObject({
            code: INCOMPATIBLE_SEGMENT_STRUCTURE, wrongDimensions: [{band: 'ndvi_intercept', expected: 1, actual: 0}]
        })
    })

    it('are refused as unestablished, not as incompatible, when the metadata states no rank', () => {
        const unstated = VALID.map(({name}) => band(name, undefined))

        expect(assetSuitability(unstated).diagnostic).toMatchObject({
            code: INSUFFICIENT_SEGMENT_EVIDENCE, undetermined: VALID.map(({name}) => name)
        })
    })

    it('do not suit when they lack the measure being monitored', () => {
        expect(assetSuitability(VALID, 'nbr').diagnostic)
            .toMatchObject({code: MONITORED_MEASURE_ABSENT, measure: 'nbr', measures: ['ndvi']})
    })

    it('do not suit with no measure that can be evaluated, coefficients without their RMSE', () => {
        expect(assetSuitability(VALID.filter(({name}) => name !== 'ndvi_rmse')).diagnostic.code).toBe(NO_SEGMENT_MEASURE)
    })

    it('need the description of the asset that establishes them, not of another', () => {
        const evidence = describedAsset('users/x/other', VALID)

        expect(SLICEABLE_MEASURE_SEGMENTS.evaluate({assetId: ASSET, evidence})).toEqual({status: NEEDS_EVIDENCE})
    })
})

describe('segments a recipe computes', () => {
    const computed = {baseBands: [{name: 'red'}, {name: 'nir'}]}

    it('suit when the recipe describes the measure being monitored', () => {
        expect(SLICEABLE_MEASURE_SEGMENTS.evaluate({evidence: computed, parameters: {monitoredMeasure: 'nir'}}).status).toBe(SUPPORTED)
    })

    it('do not suit when the measure being monitored is not one it computes', () => {
        expect(SLICEABLE_MEASURE_SEGMENTS.evaluate({evidence: computed, parameters: {monitoredMeasure: 'swir1'}}).diagnostic)
            .toMatchObject({code: MONITORED_MEASURE_ABSENT, measure: 'swir1'})
    })
})

describe('what a diagnosis says', () => {
    it('summarizes an incompatible layout by a few of its problems, and lists every one in its details', () => {
        const scalars = [band('tStart', 0), band('tEnd', 0), ...MEASURES.flatMap(measure => [band(`${measure}_coefs`, 0), band(`${measure}_rmse`, 0)])]
        const {diagnostic} = assetSuitability(scalars)

        const {message, details} = SLICEABLE_MEASURE_SEGMENTS.describe(diagnostic)

        expect(details).toHaveLength(scalars.length)
        expect(message).toContain('process.source.segments.andMore')
        expect(message).toMatch(new RegExp(`count\\\\?":${scalars.length - 3}`))
        expect(message).toContain('blue_coefs')
        expect(message).not.toContain('blue_rmse')
    })

    it('says a band whose shape was not established is unknown, never that it is a scalar', () => {
        const {diagnostic} = assetSuitability([...VALID.slice(1), band('tStart', undefined)])

        const {message} = SLICEABLE_MEASURE_SEGMENTS.describe(diagnostic)

        expect(message).toContain('process.source.segments.undetermined')
        expect(message).not.toContain('scalarBand')
    })
})

const ASSET = 'users/x/segments'
const MEASURES = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'ndvi', 'ndmi', 'ndwi', 'ndfi', 'nbr']

const band = (name, arrayDimensions) => ({name, arrayDimensions})

const VALID = [
    band('tStart', 1), band('tEnd', 1), band('tBreak', 1), band('numObs', 1), band('changeProb', 1),
    band('ndvi_coefs', 2), band('ndvi_rmse', 1), band('ndvi_magnitude', 1)
]

// An image asset as /assetMetadata states it: each band's grid as `dimensions`, its array rank on its type - none for a
// scalar, and unknown where none was established.
const describedAsset = (assetId, bands) => typedSegmentsAssetDescription({
    type: 'Image',
    bandNames: bands.map(({name}) => name),
    bands: bands.map(({name, arrayDimensions}) => ({
        id: name,
        crs: 'EPSG:4326',
        dimensions: [5015, 3093],
        data_type: {
            type: 'PixelType',
            precision: 'double',
            ...(arrayDimensions === undefined ? {dimensions: null} : arrayDimensions && {dimensions: arrayDimensions})
        }
    })),
    properties: {dateFormat: 1}
}, {assetId})

const assetSuitability = (bands, monitoredMeasure) => SLICEABLE_MEASURE_SEGMENTS.evaluate({
    assetId: ASSET,
    evidence: describedAsset(ASSET, bands),
    parameters: {monitoredMeasure}
})
