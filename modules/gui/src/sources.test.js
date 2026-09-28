import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))

const {getAvailableBands, groupedBandOptions} = await import('./sources')

// What a Sentinel-1 collection offers a temporal consumer - CCDC's base bands, the time-series and change-alerts
// charts - one value per image: not what a Radar Mosaic composites it into.
describe('the measures of a Sentinel-1 collection', () => {
    it('are its polarisations, their ratio and the orbit', () => {
        expect(getAvailableBands({dataSets: ['SENTINEL_1']})).toEqual(['VV', 'VH', 'ratio_VV_VH', 'orbit'])
    })

    it('are offered with the orbit on its own, as a whole number', () => {
        expect(groupedBandOptions({dataSets: ['SENTINEL_1']})).toEqual([
            [
                {value: 'VV', label: 'VV', dataType: {precision: 'float'}},
                {value: 'VH', label: 'VH', dataType: {precision: 'float'}},
                {value: 'ratio_VV_VH', label: 'ratio_VV_VH', dataType: {precision: 'float'}}
            ],
            [{value: 'orbit', label: 'orbit', dataType: {precision: 'int'}}],
            []
        ])
    })
})
