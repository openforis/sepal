import {jest} from '@jest/globals'
import {firstValueFrom} from 'rxjs'

// What a Time Series' catalogue answers: its declared count, however little is configured, without building its
// collection or resolving its AOI. Which bands execution builds is the live verifier's
// (verify/timeSeriesOutputBands.mjs).

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: {}}))
const getCollection$ = jest.fn()
jest.unstable_mockModule('#sepal/ee/timeSeries/collection', () => ({getCollection$}))
const toGeometry$ = jest.fn()
jest.unstable_mockModule('#sepal/ee/aoi', () => ({toGeometry$}))

const {default: timeSeries} = await import('#sepal/ee/timeSeries/timeSeries')

describe('the bands a Time Series reports', () => {
    it.each([
        ['a configured recipe', {aoi: {}, dates: {}, sources: {dataSets: {LANDSAT: ['LANDSAT_8']}}, options: {}}],
        ['a recipe configuring nothing', {}]
    ])('are its count alone, for %s', async (_case, model) => {
        expect(await firstValueFrom(timeSeries({model}).getBands$())).toEqual(['count'])
        expect(getCollection$).not.toHaveBeenCalled()
        expect(toGeometry$).not.toHaveBeenCalled()
    })
})
