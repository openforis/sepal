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

const bandsOf = visualizationType => visualizationOptions(recipe, visualizationType)
    .flatMap(({options}) => options)
    .map(({value}) => value)

it('offers the change bands in changes mode', () => {
    expect(bandsOf('changes')).toEqual(['mag', 'yod', 'dur', 'preval', 'postval', 'rmse', 'sig'])
})

it('offers the optical mosaic band combinations in mosaics mode', () => {
    expect(bandsOf('mosaics')).toContain('ndvi')
})

it('no longer offers the start and end RGB composites', () => {
    expect(bandsOf('changes')).not.toContain('startRed, startGreen, startBlue')
    expect(bandsOf('changes')).not.toContain('endRed, endGreen, endBlue')
})

it('presets used for retrieval cover only the change bands', () => {
    const bands = getPreSetVisualizations(recipe).flatMap(({bands}) => bands)
    expect(bands).toEqual(['mag', 'yod', 'dur', 'preval', 'postval', 'rmse', 'sig'])
})
