import {vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {bandPresentation, groupedBandPresentation, mapProducts} = await import('./bands')
const {bandPresentation: opticalBandPresentation} = await import('../opticalMosaic/bands')

const CHANGE_BANDS = ['yod', 'mag', 'dur', 'preval', 'postval', 'rmse', 'sig']

const recipe = {
    model: {
        dates: {startYear: 2000, endYear: 2024},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: ['SR']}
    }
}

const ANNUAL_MOSAIC = mapProducts.productOf({visualizationType: 'mosaics', year: 2020})

it('presents the change bands of its output, with their labels and cursor precision', () => {
    const presentation = bandPresentation(recipe, {name: 'IMAGE_OUTPUT'})

    expect(Object.keys(presentation)).toEqual(CHANGE_BANDS)
    expect(presentation.yod).toEqual({dataType: {precision: 'int'}, label: 'process.landTrendr.bands.yod'})
    expect(presentation.mag.dataType).toEqual({precision: 'float'})
})

it('names the annual mosaic a layer shows with its year', () => {
    expect(ANNUAL_MOSAIC).toEqual({name: 'ANNUAL_MOSAIC', parameters: {year: 2020}})
})

it('presents the annual mosaic as an optical mosaic', () => {
    expect(bandPresentation(recipe, ANNUAL_MOSAIC)).toEqual(opticalBandPresentation())
})

// Both products are declared, so no band answer is left in the legacy entry.
it('answers no bands itself', () => {
    expect(mapProducts.bands).toBeUndefined()
})

it('offers only the change bands for retrieval', () => {
    const bands = groupedBandPresentation().flat().map(({value}) => value)
    expect(bands).toEqual(CHANGE_BANDS)
})
