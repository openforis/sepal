import {describe, expect, it} from 'vitest'

import {resolveChartBand} from './chartBandSelection'

describe('resolving a transient chart band', () => {
    it('keeps an available selection even when it is not the first band', () => {
        expect(resolveChartBand('vh', ['vv', 'vh'])).toBe('vh')
    })

    it.each(['ndvi', undefined])('uses the first available band when %s is unavailable', selected => {
        expect(resolveChartBand(selected, ['vv', 'vh'])).toBe('vv')
    })

    it('returns no selection when no bands are available', () => {
        expect(resolveChartBand('ndvi', [])).toBeUndefined()
    })
})
