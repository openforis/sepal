import {describe, expect, it} from 'vitest'

import {preprocessing} from './preprocessing'

describe('the pre-processing chosen data sets take', () => {
    it('is the orbits for Sentinel-1', () => {
        expect(preprocessing(['SENTINEL_1'])).toEqual({orbits: true, cloudMasking: false})
    })

    it('is cloud masking for Landsat and Sentinel-2', () => {
        expect(preprocessing(['LANDSAT_8', 'SENTINEL_2'])).toEqual({orbits: false, cloudMasking: true})
    })

    it('is none for Planet alone, which is cloud masked by its own settings', () => {
        expect(preprocessing(['DAILY'])).toEqual({orbits: false, cloudMasking: false})
    })
})
