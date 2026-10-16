import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {isValidSamplingSeed, requiresSamplingSeed} from './samplingSeed.js'

describe('requiresSamplingSeed', () => {
    it('requires a seed for random placement, systematic EXACT thinning, and a SEEDED grid start', () => {
        assert.equal(requiresSamplingSeed({arrangementStrategy: 'RANDOM'}), true)
        assert.equal(
            requiresSamplingSeed({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'EXACT'}),
            true
        )
        assert.equal(
            requiresSamplingSeed({arrangementStrategy: 'SYSTEMATIC', gridOrigin: 'SEEDED'}),
            true
        )
    })

    it('does not require a seed for systematic Oversample/Closest with a fixed grid start', () => {
        assert.equal(
            requiresSamplingSeed({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED'}),
            false
        )
        assert.equal(
            requiresSamplingSeed({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'CLOSEST', gridOrigin: 'FIXED'}),
            false
        )
    })
})

describe('isValidSamplingSeed', () => {
    it('accepts positive whole numbers', () => {
        assert.equal(isValidSamplingSeed(1), true)
        assert.equal(isValidSamplingSeed('3'), true)
        assert.equal(isValidSamplingSeed(Number.MAX_SAFE_INTEGER), true)
        assert.equal(isValidSamplingSeed(String(Number.MAX_SAFE_INTEGER)), true)
    })

    it('rejects unsafe integers, zero, negatives, fractions, blank and missing', () => {
        assert.equal(isValidSamplingSeed(9007199254740992), false)
        assert.equal(isValidSamplingSeed('9007199254740992'), false)
        assert.equal(isValidSamplingSeed('9007199254740993'), false)
        assert.equal(isValidSamplingSeed(0), false)
        assert.equal(isValidSamplingSeed(-1), false)
        assert.equal(isValidSamplingSeed(1.5), false)
        assert.equal(isValidSamplingSeed(''), false)
        assert.equal(isValidSamplingSeed(null), false)
        assert.equal(isValidSamplingSeed(undefined), false)
    })
})
