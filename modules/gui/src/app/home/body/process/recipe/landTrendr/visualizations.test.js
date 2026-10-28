import {vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {getPreSetVisualizations, visualizationOptions} = await import('./visualizations')

const recipe = {
    model: {
        dates: {startYear: 2000, endYear: 2024},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: ['SR']}
    }
}

// A layer's read, as far as the styles depend on it: what it described, and which product that was.
const CHANGES = {description: {output: {}}}
const ANNUAL_MOSAIC = {description: {output: {product: {name: 'ANNUAL_MOSAIC', parameters: {year: 2020}}}}}
const NOTHING_DESCRIBED = {description: null}

const bandsOf = read => visualizationOptions(recipe, read)
    .flatMap(({options}) => options)
    .map(({value}) => value)

it('offers the change bands for the changes', () => {
    expect(bandsOf(CHANGES)).toEqual(['mag', 'yod', 'dur', 'preval', 'postval', 'rmse', 'sig'])
})

it('offers the optical mosaic band combinations for the annual mosaic', () => {
    expect(bandsOf(ANNUAL_MOSAIC)).toContain('ndvi')
    expect(bandsOf(ANNUAL_MOSAIC)).not.toContain('yod')
})

it('offers nothing while nothing is described', () => {
    expect(bandsOf(NOTHING_DESCRIBED)).toEqual([])
})

it('no longer offers the start and end RGB composites', () => {
    expect(bandsOf(CHANGES)).not.toContain('startRed, startGreen, startBlue')
    expect(bandsOf(CHANGES)).not.toContain('endRed, endGreen, endBlue')
})

it('presets used for retrieval cover only the change bands', () => {
    const bands = getPreSetVisualizations(recipe).flatMap(({bands}) => bands)
    expect(bands).toEqual(['mag', 'yod', 'dur', 'preval', 'postval', 'rmse', 'sig'])
})
