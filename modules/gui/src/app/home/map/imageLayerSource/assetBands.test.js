import {describe, expect, it} from 'vitest'

import {renderableBandNames} from '~/app/home/body/process/recipe/visualizationMatching'

import {assetAvailableBands} from './assetBands'

// An asset's bands as its map layer draws them, from Earth Engine metadata: a PixelType states `dimensions` only for an
// array. What cannot be read as a count, or is not a PixelType at all, establishes nothing and is never drawn.

describe('the bands an asset layer draws', () => {
    it('reads a PixelType without dimensions as a scalar, which is drawn', () => {
        const bands = assetAvailableBands(metadata({elevation: {type: 'PixelType', precision: 'int', min: -32768, max: 32767}}))

        expect(bands.elevation.dataType).toMatchObject({arrayDimensions: 0, precision: 'int'})
        expect(renderableBandNames(bands)).toEqual(['elevation'])
    })

    it.each([1, 2])('reads a PixelType of %i dimensions as an array, which is not drawn', dimensions => {
        const bands = assetAvailableBands(metadata({coefs: {type: 'PixelType', precision: 'float', dimensions}}))

        expect(bands.coefs.dataType.arrayDimensions).toBe(dimensions)
        expect(renderableBandNames(bands)).toEqual([])
    })

    it.each([
        ['negative dimensions', {type: 'PixelType', precision: 'int', dimensions: -1}],
        ['fractional dimensions', {type: 'PixelType', precision: 'int', dimensions: 1.5}],
        ['dimensions given as text', {type: 'PixelType', precision: 'int', dimensions: '1'}],
        ['a data type that is no PixelType', {precision: 'int'}],
        ['no data type at all', undefined]
    ])('establishes nothing from %s, and does not draw the band', (_case, dataType) => {
        const bands = assetAvailableBands(metadata({band: dataType}))

        expect(bands.band.dataType.arrayDimensions).toBeUndefined()
        expect(renderableBandNames(bands)).toEqual([])
    })

    it('offers the bands the metadata names, in its order', () => {
        const scalar = {type: 'PixelType', precision: 'int'}

        expect(Object.keys(assetAvailableBands(metadata({b: scalar, a: scalar})))).toEqual(['b', 'a'])
    })
})

const metadata = dataTypes => ({
    bandNames: Object.keys(dataTypes),
    bands: Object.entries(dataTypes).map(([id, dataType]) => ({id, ...(dataType && {data_type: dataType})}))
})
