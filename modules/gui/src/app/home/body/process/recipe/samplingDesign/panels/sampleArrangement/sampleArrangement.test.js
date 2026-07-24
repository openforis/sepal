import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {includeCrs, includeMinDistance, includeSeed, isSkipped} = await import('./arrangementApplicability')

describe('isSkipped', () => {
    it('is true for boolean-true and non-empty-array skip, false otherwise', () => {
        expect(isSkipped(true)).toBe(true)
        expect(isSkipped([true])).toBe(true)
        expect(isSkipped(false)).toBe(false)
        expect(isSkipped([])).toBe(false)
        expect(isSkipped(undefined)).toBe(false)
    })
})

describe('includeSeed', () => {
    it('shows seed for random sampling, systematic EXACT, and SEEDED grid start', () => {
        expect(includeSeed({arrangementStrategy: 'RANDOM'})).toBe(true)
        expect(includeSeed({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'EXACT'})).toBe(true)
        expect(includeSeed({arrangementStrategy: 'SYSTEMATIC', gridOrigin: 'SEEDED'})).toBe(true)
    })

    it('hides seed for systematic OVER at a FIXED grid start', () => {
        expect(includeSeed({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED'})).toBe(false)
    })
})

describe('includeMinDistance', () => {
    it('is true for systematic and false for random', () => {
        expect(includeMinDistance({arrangementStrategy: 'SYSTEMATIC'})).toBe(true)
        expect(includeMinDistance({arrangementStrategy: 'RANDOM'})).toBe(false)
    })

    it('is false for an unset arrangement', () => {
        expect(includeMinDistance({})).toBe(false)
    })
})

describe('includeCrs', () => {
    it('is true only for unstratified Systematic', () => {
        expect(includeCrs({unstratified: true, arrangementStrategy: 'SYSTEMATIC'})).toBe(true)
    })

    it('is false for stratified designs and unstratified Random', () => {
        expect(includeCrs({unstratified: false, arrangementStrategy: 'RANDOM'})).toBe(false)
        expect(includeCrs({unstratified: false, arrangementStrategy: 'SYSTEMATIC'})).toBe(false)
        expect(includeCrs({unstratified: true, arrangementStrategy: 'RANDOM'})).toBe(false)
    })
})
