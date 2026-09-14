import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

const catalogue = new Map()

// Optical and radar band discovery is local; no Earth Engine operations are needed.
mock.module('#sepal/ee/ee', {exports: {default: {Image: {}}}})

const {configureRecipeReader} = await import('#sepal/ee/recipe')

configureRecipeReader(id =>
    catalogue.has(id)
        ? of(catalogue.get(id))
        : throwError(() => new Error(`No such recipe: ${id}`))
)

const {default: imageFactory} = await import('#sepal/ee/imageFactory')

beforeEach(() => catalogue.clear())

describe('CCDC band discovery', () => {
    it('uses TOA bands for omitted corrections, just as for an explicit empty list', async () => {
        const recipe = ccdc()
        const uncorrected = ccdc({options: {corrections: []}})

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())
        const uncorrectedBands = await firstValueFrom(imageFactory(uncorrected).getBands$())

        assert.deepEqual(bands, uncorrectedBands)
        assert.ok(bands.includes('cirrus_coefs'))
        assert.ok(bands.includes('ndvi_coefs'))
    })

    it('honors explicit surface-reflectance corrections', async () => {
        const recipe = ccdc({options: {corrections: ['SR', 'BRDF']}})

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())

        assert.ok(bands.includes('thermal_coefs'))
        assert.ok(bands.includes('ndvi_coefs'))
        assert.ok(!bands.includes('cirrus_coefs'))
        assert.ok(!bands.includes('pan_coefs'))
    })

    it('describes the selected optical sensor', async () => {
        const recipe = ccdc({dataSets: {SENTINEL_2: ['SENTINEL_2']}})

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())

        assert.ok(bands.includes('redEdge1_coefs'))
        assert.ok(!bands.includes('thermal_coefs'))
    })

    it('keeps radar bands separate from optical bands', async () => {
        const recipe = ccdc({dataSets: {SENTINEL_1: ['SENTINEL_1']}})

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())

        assert.ok(bands.includes('VV_coefs'))
        assert.ok(bands.includes('VH_coefs'))
        assert.ok(!bands.includes('ndvi_coefs'))
    })
})

describe('Slice band discovery over a CCDC reference', () => {
    it('resolves optical slice bands when the source omits corrections', async () => {
        const source = ccdc()
        catalogue.set(source.id, source)
        const recipe = sliceOver(source)

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())

        assert.ok(bands.includes('ndvi'))
        assert.ok(bands.includes('cirrus'))
        assert.ok(bands.includes('ndvi_intercept'))
        assert.ok(!bands.includes('ndvi_coefs'))
    })
})

describe('Masking band discovery over saved recipes', () => {
    it('loads an unopened Slice and its optical CCDC source without corrections', async () => {
        const source = ccdc()
        const slice = sliceOver(source)
        catalogue.set(source.id, source)
        catalogue.set(slice.id, slice)
        const recipe = {
            id: 'masking-1',
            type: 'MASKING',
            model: {imageToMask: {type: 'RECIPE_REF', id: slice.id}}
        }

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())

        assert.ok(bands.includes('ndvi'))
        assert.ok(bands.includes('cirrus'))
        assert.ok(bands.includes('ndvi_intercept'))
        assert.ok(!bands.includes('ndvi_coefs'))
    })
})

const ccdc = ({dataSets = {LANDSAT: ['LANDSAT_8']}, options = {}} = {}) => ({
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        sources: {dataSets},
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
        options,
        ccdcOptions: {dateFormat: 1}
    }
})

const sliceOver = source => ({
    id: 'slice-1',
    type: 'CCDC_SLICE',
    model: {
        source: {type: 'RECIPE_REF', id: source.id},
        date: {dateType: 'SINGLE', date: '2020-06-01'},
        options: {gapStrategy: 'INTERPOLATE', harmonics: 3}
    }
})
