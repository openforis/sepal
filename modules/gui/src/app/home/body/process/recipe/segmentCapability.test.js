import {firstValueFrom, of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {addRecipeType} from '../recipeTypeRegistry'
import {describeSegmentSource$} from './segmentCapability'

// Which recipe describes the segments a selected source stands for, over the shared capability rule and the
// providers recipe types register. The selection is not necessarily the producer: a Masking over CCDC stands
// for CCDC's segments while remaining what the consumer executes.

const assetMetadata$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {gee: {assetMetadata$: (...args) => assetMetadata$(...args)}}}))
vi.mock('~/sources', () => ({getAvailableBands: ({dataSets}) => dataSets.map(dataSet => dataSet.toLowerCase())}))
vi.mock('./ccdc/ccdcRecipe', () => ({getAllVisualizations: () => []}))

// The shared definitions the rule reads: which types produce segments, and which declare that they preserve
// an input's schema and values.
await import('#sepal/recipe/type/ccdc')
await import('#sepal/recipe/type/assetMosaic')
await import('#sepal/recipe/type/masking')
await import('#sepal/recipe/type/opticalMosaic')

const {describeSegments$} = await import('./ccdc/segmentDescription')
const {describeSegmentsAsset$} = await import('./ccdc/segmentsAsset')

const SEGMENTS_ASSET = 'users/x/segments'

beforeEach(() => {
    assetMetadata$.mockReset()
    assetMetadata$.mockReturnValue(of({
        bandNames: ['ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude', 'tStart'],
        properties: {dateFormat: 2}
    }))
})

afterEach(() => vi.restoreAllMocks())

// The providers each type registers in the GUI. Registering them here rather than importing the recipe
// components keeps this about the capability, not about React.
addRecipeType({id: 'CCDC', describeSegments$})
addRecipeType({id: 'ASSET_MOSAIC', describeSegments$: ({recipe}) => describeSegmentsAsset$(recipe.model.assetDetails.assetId)})
addRecipeType({id: 'MASKING'})
addRecipeType({id: 'MOSAIC'})

describe('describing the segments a source stands for', () => {
    it('asks the producer when it was selected directly', async () => {
        const described = await descriptionOf({type: 'RECIPE_REF', id: 'ccdc-1'}, [ccdc()])

        expect(described.dateFormat).toBe(1)
        expect(described.baseBands.map(({name}) => name)).toEqual(['red'])
    })

    it('asks the producer a wrapper preserves', async () => {
        const described = await descriptionOf(
            {type: 'RECIPE_REF', id: 'masking-1'},
            [ccdc(), masking('masking-1', {type: 'RECIPE_REF', id: 'ccdc-1'})]
        )

        expect(described.dateFormat).toBe(1)
    })

    it('follows the declared preserving input through several wrappers', async () => {
        const described = await descriptionOf(
            {type: 'RECIPE_REF', id: 'outer'},
            [ccdc(), masking('inner', {type: 'RECIPE_REF', id: 'ccdc-1'}), masking('outer', {type: 'RECIPE_REF', id: 'inner'})]
        )

        expect(described.dateFormat).toBe(1)
    })

    // The mask is an edge of the wrapper, but it fills no preserving role.
    it('never follows the wrapper\'s mask', async () => {
        const wrapper = masking('masking-1', {type: 'RECIPE_REF', id: 'ccdc-1'})
        wrapper.model.imageMask = {type: 'RECIPE_REF', id: 'other-ccdc'}

        const described = await descriptionOf({type: 'RECIPE_REF', id: 'masking-1'}, [
            ccdc(), ccdc({id: 'other-ccdc', dateFormat: 2}), wrapper
        ])

        expect(described.dateFormat).toBe(1)
    })

    it('describes an asset-backed producer from the asset itself', async () => {
        const described = await descriptionOf({type: 'RECIPE_REF', id: 'masking-1'}, [
            assetMosaic(),
            masking('masking-1', {type: 'RECIPE_REF', id: 'asset-mosaic-1'})
        ])

        expect(described.dateFormat).toBe(2)
        expect(described.baseBands.map(({name}) => name)).toEqual(['ndvi'])
    })

    it('describes a bare asset from the asset itself', async () => {
        const described = await descriptionOf({type: 'ASSET', id: SEGMENTS_ASSET}, [])

        expect(described.dateFormat).toBe(2)
    })
})

describe('a source that cannot describe segments', () => {
    it('is unsupported when it is a terminal recipe that produces none', async () => {
        const error = await failure({type: 'RECIPE_REF', id: 'mosaic-1'}, [
            {id: 'mosaic-1', type: 'MOSAIC', model: {aoi: {}, dates: {}, sources: {}, compositeOptions: {}}}
        ])

        expect(error.code).toBe('UNSUPPORTED_SEGMENT_SOURCE')
    })

    it('is malformed when a declared preserving role is not filled', async () => {
        const error = await failure({type: 'RECIPE_REF', id: 'masking-1'}, [
            {id: 'masking-1', type: 'MASKING', model: {}}
        ])

        expect(error.code).toBe('MALFORMED_SEGMENT_SOURCE')
    })

    it('is unresolved when the record is not among those the closure resolved', async () => {
        const error = await failure({type: 'RECIPE_REF', id: 'missing'}, [])

        expect(error.code).toBe('UNRESOLVED_SEGMENT_SOURCE')
    })
})

const descriptionOf = (reference, records) => firstValueFrom(
    describeSegmentSource$(reference, {
        graph: {edges: []},
        recipesById: new Map(records.map(record => [record.id, record]))
    })
)

const failure = async (reference, records) => {
    try {
        await descriptionOf(reference, records)
        throw new Error('Expected describing the source to fail')
    } catch (error) {
        return error
    }
}

const ccdc = ({id = 'ccdc-1', dateFormat = 1} = {}) => ({
    id,
    type: 'CCDC',
    model: {
        sources: {dataSets: {LANDSAT: ['RED']}},
        options: {corrections: []},
        ccdcOptions: {dateFormat},
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'}
    }
})

const assetMosaic = () => ({
    id: 'asset-mosaic-1',
    type: 'ASSET_MOSAIC',
    model: {aoi: {}, assetDetails: {assetId: SEGMENTS_ASSET}}
})

const masking = (id, imageToMask) => ({
    id,
    type: 'MASKING',
    model: {imageToMask, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
})
