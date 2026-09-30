import {jest} from '@jest/globals'
import {firstValueFrom} from 'rxjs'

// What a Radar Mosaic's catalogue answers: its configuration's declared output, however it was asked. Which bands
// execution builds for a request is the live verifier's (verify/radarMosaicOutputBands.mjs).

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: {}}))

const {RADAR_MOSAIC_BANDS} = await import('#sepal/recipe/type/radarMosaic')
const {default: mosaic} = await import('#sepal/ee/radar/mosaic')

const POINT_IN_TIME = RADAR_MOSAIC_BANDS.POINT_IN_TIME.map(({name}) => name)
const TIME_SCAN = RADAR_MOSAIC_BANDS.TIME_SCAN.map(({name}) => name)

describe('the bands a Radar Mosaic reports', () => {
    it.each([
        ['nothing', undefined],
        ['an empty selection', {selection: []}],
        ['bands depending on no harmonic', {selection: ['VV_min', 'NDCV']}],
        ['one polarisation\'s harmonics, out of order', {selection: ['VH_const', 'VV_min']}]
    ])('are every band of a time scan, whatever it is asked for: %s', async (_case, args) => {
        expect(await reportedBands(radar({fromDate: '2023-01-01', toDate: '2024-01-01'}), args)).toEqual(TIME_SCAN)
    })

    it('are the point in time\'s own for a target date', async () => {
        expect(await reportedBands(radar({targetDate: '2023-06-01'}), {selection: ['VV']})).toEqual(POINT_IN_TIME)
    })

    // Execution composites around the target date whatever else is stated, and runs no date validation.
    it('are the point in time\'s for a recipe stating a target date beside a period', async () => {
        expect(await reportedBands(radar({targetDate: '2023-06-01', fromDate: '2023-01-01', toDate: '2024-01-01'})))
            .toEqual(POINT_IN_TIME)
    })

    it('are a time scan\'s for a recipe stating no dates, which fails only when run', async () => {
        expect(await reportedBands(radar({}))).toEqual(TIME_SCAN)
    })
})

// The same default is what the rest of the factory reads, so it has to be a selection rather than nothing.
it('accepts an operation that states no selection', async () => {
    await expect(firstValueFrom(mosaic(radar({fromDate: '2023-01-01', toDate: '2024-01-01'}), {}).getVisParams$()))
        .resolves.toBeDefined()
})

const radar = dates => ({model: {aoi: {}, dates, options: {}}})

const reportedBands = (recipe, args) => firstValueFrom(mosaic(recipe, args).getBands$())
