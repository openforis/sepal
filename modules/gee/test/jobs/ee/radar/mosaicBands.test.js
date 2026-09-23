import {jest} from '@jest/globals'
import {firstValueFrom} from 'rxjs'

// Which harmonic bands a time scan reports, which is derived from what the caller selected. The rest of the
// answer is the list the composite selects by, so only the derivation is in question here.

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: {}}))

const {TIME_SCAN_BANDS} = await import('#sepal/ee/radar/composite')
const {default: mosaic} = await import('#sepal/ee/radar/mosaic')

describe('the harmonic bands a time-scan Radar Mosaic reports', () => {
    it('are none when no selected band depends on them', async () => {
        expect(await reportedBands({selection: ['VV_min']})).toEqual(TIME_SCAN_BANDS)
    })

    // Every harmonic band is a dependent of the default selection, so both polarisations are derived.
    it('cover both polarisations for an operation that states no selection', async () => {
        const bands = await reportedBands({})

        expect(bands).toContain('VV_phase')
        expect(bands).toContain('VH_phase')
    })

    it('cover only the polarisations the selected bands depend on', async () => {
        const bands = await reportedBands({selection: ['VV_phase']})

        expect(bands).toContain('VV_phase')
        expect(bands).toContain('VV_const')
        expect(bands).not.toContain('VH_phase')
    })
})

// The same default is what the rest of the factory reads, so it has to be a selection rather than nothing.
it('accepts an operation that states no selection', async () => {
    await expect(visParams({})).resolves.toBeDefined()
})

const timeScan = {model: {aoi: {}, dates: {fromDate: '2023-01-01', toDate: '2024-01-01'}, options: {}}}

const reportedBands = args => firstValueFrom(mosaic(timeScan, args).getBands$())

const visParams = args => firstValueFrom(mosaic(timeScan, args).getVisParams$())
