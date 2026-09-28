import {vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {bandPresentation, groupedBandPresentation, mapProducts} = await import('./bands')

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

it('names the annual mosaic a layer shows with its year, and answers its optical bands', () => {
    expect(ANNUAL_MOSAIC).toEqual({name: 'ANNUAL_MOSAIC', parameters: {year: 2020}})

    const bands = Object.keys(mapProducts.bands(recipe, ANNUAL_MOSAIC))
    expect(bands).toContain('ndvi')
    expect(bands).toContain('red')
    expect(bands).not.toContain('yod')
})

it('no longer answers its output from the legacy entry, which its declaration does', () => {
    expect(mapProducts.bands(recipe, {name: 'IMAGE_OUTPUT'})).toBeUndefined()
})

it('offers only the change bands for retrieval', () => {
    const bands = groupedBandPresentation().flat().map(({value}) => value)
    expect(bands).toEqual(CHANGE_BANDS)
})
