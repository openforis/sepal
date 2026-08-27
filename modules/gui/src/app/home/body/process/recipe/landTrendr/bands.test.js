import {vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {getAvailableBands, getGroupedBandOptions} = await import('./bands')

const CHANGE_BANDS = ['yod', 'mag', 'dur', 'preval', 'postval', 'rmse', 'sig']

const recipe = {
    model: {
        dates: {startYear: 2000, endYear: 2024},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: ['SR']}
    }
}

it('exposes only the change bands in changes mode', () => {
    expect(Object.keys(getAvailableBands(recipe, 'changes'))).toEqual(CHANGE_BANDS)
})

it('exposes the optical mosaic bands in mosaics mode', () => {
    const bands = Object.keys(getAvailableBands(recipe, 'mosaics'))
    expect(bands).toContain('ndvi')
    expect(bands).toContain('red')
})

it('exposes both sets when no visualization type is given', () => {
    const bands = Object.keys(getAvailableBands(recipe))
    expect(bands).toContain('yod')
    expect(bands).toContain('ndvi')
})

it('no longer exposes the start and end RGB composites', () => {
    const bands = Object.keys(getAvailableBands(recipe))
    expect(bands).not.toContain('startRed')
    expect(bands).not.toContain('endBlue')
})

it('offers only the change bands for retrieval', () => {
    const bands = getGroupedBandOptions().flat().map(({value}) => value)
    expect(bands).toEqual(CHANGE_BANDS)
})
