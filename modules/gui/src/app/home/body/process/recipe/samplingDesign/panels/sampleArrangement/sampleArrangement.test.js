import {describe, expect, it} from 'vitest'

import {shouldShowMore} from './showMore'

const base = {
    crs: undefined,
    crsTransform: undefined,
    seed: undefined,
    arrangementStrategy: undefined,
    sampleSizeStrategy: undefined,
    gridOrigin: undefined
}

describe('shouldShowMore', () => {
    it('is collapsed for empty/new values', () => {
        expect(shouldShowMore(base)).toBe(false)
    })

    it('is collapsed for a missing seed', () => {
        expect(shouldShowMore({...base, seed: undefined})).toBe(false)
    })

    it('is collapsed for the default seed (number and string)', () => {
        expect(shouldShowMore({...base, seed: 1})).toBe(false)
        expect(shouldShowMore({...base, seed: '1'})).toBe(false)
    })

    it('is expanded for a non-default seed (number and string)', () => {
        expect(shouldShowMore({...base, seed: 2})).toBe(true)
        expect(shouldShowMore({...base, seed: '2'})).toBe(true)
    })

    it('is collapsed for a missing CRS', () => {
        expect(shouldShowMore({...base, crs: undefined})).toBe(false)
    })

    it('is collapsed for the default CRS', () => {
        expect(shouldShowMore({...base, crs: 'EPSG:3410'})).toBe(false)
    })

    it('is expanded for a non-default CRS', () => {
        expect(shouldShowMore({...base, crs: 'EPSG:4326'})).toBe(true)
    })

    it('is expanded when a CRS transform is present', () => {
        expect(shouldShowMore({...base, crsTransform: '[1,0,0,0,1,0]'})).toBe(true)
    })

    it('is collapsed for RANDOM + OVER + FIXED defaults', () => {
        expect(shouldShowMore({
            ...base,
            arrangementStrategy: 'RANDOM',
            sampleSizeStrategy: 'OVER',
            gridOrigin: 'FIXED'
        })).toBe(false)
    })

    it('is collapsed for SYSTEMATIC + FIXED + OVER', () => {
        expect(shouldShowMore({
            ...base,
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: 'OVER',
            gridOrigin: 'FIXED'
        })).toBe(false)
    })

    it('stays collapsed for SYSTEMATIC + SEEDED grid start at the default seed (Random must not force More open)', () => {
        expect(shouldShowMore({
            ...base,
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: 'OVER',
            gridOrigin: 'SEEDED',
            seed: 1
        })).toBe(false)
    })

    it('stays collapsed for SYSTEMATIC + EXACT at the default seed', () => {
        expect(shouldShowMore({
            ...base,
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: 'EXACT',
            seed: 1
        })).toBe(false)
    })

    it('expands when the seed is non-default, regardless of SEEDED grid start', () => {
        expect(shouldShowMore({
            ...base,
            arrangementStrategy: 'SYSTEMATIC',
            gridOrigin: 'SEEDED',
            seed: 2
        })).toBe(true)
    })
})
