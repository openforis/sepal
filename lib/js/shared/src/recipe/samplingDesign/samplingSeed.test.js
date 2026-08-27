import {isValidSamplingSeed, requiresSamplingSeed} from './samplingSeed.js'

describe('requiresSamplingSeed', () => {
    it('requires a seed for random placement, systematic EXACT thinning, and a SEEDED grid start', () => {
        expect(requiresSamplingSeed({arrangementStrategy: 'RANDOM'})).toBe(true)
        expect(requiresSamplingSeed({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'EXACT'})).toBe(true)
        expect(requiresSamplingSeed({arrangementStrategy: 'SYSTEMATIC', gridOrigin: 'SEEDED'})).toBe(true)
    })

    it('does not require a seed for systematic Oversample/Closest with a fixed grid start', () => {
        expect(requiresSamplingSeed({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED'})).toBe(false)
        expect(requiresSamplingSeed({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'CLOSEST', gridOrigin: 'FIXED'})).toBe(false)
    })
})

describe('isValidSamplingSeed', () => {
    it('accepts positive whole numbers', () => {
        expect(isValidSamplingSeed(1)).toBe(true)
        expect(isValidSamplingSeed('3')).toBe(true)
        expect(isValidSamplingSeed(Number.MAX_SAFE_INTEGER)).toBe(true)
        expect(isValidSamplingSeed(String(Number.MAX_SAFE_INTEGER))).toBe(true)
    })

    it('rejects unsafe integers, zero, negatives, fractions, blank and missing', () => {
        expect(isValidSamplingSeed(9007199254740992)).toBe(false)
        expect(isValidSamplingSeed('9007199254740992')).toBe(false)
        expect(isValidSamplingSeed('9007199254740993')).toBe(false)
        expect(isValidSamplingSeed(0)).toBe(false)
        expect(isValidSamplingSeed(-1)).toBe(false)
        expect(isValidSamplingSeed(1.5)).toBe(false)
        expect(isValidSamplingSeed('')).toBe(false)
        expect(isValidSamplingSeed(null)).toBe(false)
        expect(isValidSamplingSeed(undefined)).toBe(false)
    })
})
