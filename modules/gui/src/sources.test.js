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

// What a temporal consumer offers over a Planet collection: the choices it has always offered, which Planet Mosaic's
// kndvi does not extend.
describe('the choices over a Planet collection', () => {
    const int10000 = {precision: 'int', min: -10000, max: 10000}
    const option = value => ({value, label: value, dataType: int10000})

    it('are its spectral bands and five indexes', () => {
        expect(getAvailableBands({dataSets: ['DAILY']}))
            .toEqual(['blue', 'green', 'red', 'nir', 'ndvi', 'ndwi', 'evi', 'evi2', 'savi'])
    })

    it('are offered with the spectral bands before the indexes', () => {
        expect(groupedBandOptions({dataSets: ['NICFI']})).toEqual([
            ['blue', 'green', 'red', 'nir'].map(option),
            ['ndvi', 'ndwi', 'evi', 'evi2', 'savi'].map(option),
            []
        ])
    })
})
