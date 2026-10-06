import {describe, expect, it, vi} from 'vitest'

import {INCOMPATIBLE_SEGMENT_STRUCTURE} from '#sepal/recipe/requirement/ccdcSegments'

import {typedSegmentsAssetDescription} from './ccdc/segmentsAsset'
import {SEGMENTS} from './segmentCapability'
import {SLICEABLE_SEGMENTS} from './segmentRequirements'
import {NEEDS_EVIDENCE, SUPPORTED} from './sourceRequirements'

vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))

// The shared segment requirements as the GUI reads them: the facts an accepted observation supplies, and what their
// diagnoses say. The rules themselves are the shared library's (requirement/ccdcSegments.test.js).

describe('the facts an observation of segments supplies', () => {
    it('are the typed bands of the asset that establishes them, as /assetMetadata answers for it', () => {
        expect(SLICEABLE_SEGMENTS.evaluate(assetFacts(ASSET, VALID))).toEqual({status: SUPPORTED, measures: ['ndvi']})
    })

    it('are none for the description of another asset', () => {
        expect(SEGMENTS.factsOf({segments: describedAsset('users/x/other', VALID)}, ASSET)).toBe(null)
        expect(SLICEABLE_SEGMENTS.evaluate(SEGMENTS.factsOf({segments: describedAsset('users/x/other', VALID)}, ASSET)))
            .toEqual({status: NEEDS_EVIDENCE})
    })

    it('are the measures a computing recipe describes', () => {
        expect(SEGMENTS.factsOf({segments: {baseBands: [{name: 'red'}, {name: 'nir'}]}}))
            .toEqual({producer: 'COMPUTED', measures: ['red', 'nir']})
    })
})

describe('what a diagnosis says', () => {
    it('summarizes an incompatible layout by a few of its problems, and lists every one in its details', () => {
        const scalars = [band('tStart', 0), band('tEnd', 0), ...MEASURES.flatMap(measure => [band(`${measure}_coefs`, 0), band(`${measure}_rmse`, 0)])]
        const {diagnostic} = SLICEABLE_SEGMENTS.evaluate(assetFacts(ASSET, scalars))

        const {message, details} = SLICEABLE_SEGMENTS.describe(diagnostic)

        expect(diagnostic.code).toBe(INCOMPATIBLE_SEGMENT_STRUCTURE)
        expect(details).toHaveLength(scalars.length)
        expect(message).toContain('process.source.segments.andMore')
        expect(message).toMatch(new RegExp(`count\\\\?":${scalars.length - 3}`))
        expect(message).toContain('blue_coefs')
        expect(message).not.toContain('blue_rmse')
    })

    it('says a band whose shape was not established is unknown, never that it is a scalar', () => {
        const {diagnostic} = SLICEABLE_SEGMENTS.evaluate(assetFacts(ASSET, [...VALID.slice(1), band('tStart', undefined)]))

        const {message} = SLICEABLE_SEGMENTS.describe(diagnostic)

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

const assetFacts = (assetId, bands) => SEGMENTS.factsOf({segments: describedAsset(assetId, bands)}, assetId)

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
