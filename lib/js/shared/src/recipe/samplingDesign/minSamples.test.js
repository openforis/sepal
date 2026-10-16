import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {
    effectiveMinSamplesPerStratum,
    isValidMinSamplesPerStratum,
    isValidStratumSampleSize,
    MIN_SAMPLES_PER_STRATUM,
    minimumTotalSampleSize,
    usesConfiguredMinSamplesPerStratum
} from './minSamples.js'

// The shared contract the Sample Allocation panel enforces and the task layer re-checks. Two samples is a
// hard statistical floor: no strategy and no configuration can go below it.
describe('MIN_SAMPLES_PER_STRATUM', () => {
    it('is the statistical floor of 2', () => {
        assert.equal(MIN_SAMPLES_PER_STRATUM, 2)
    })
})

// The single decision behind the panel's field visibility, both GUI validators and the task preflight.
describe('usesConfiguredMinSamplesPerStratum', () => {
    it('is false for EQUAL and manual allocation, which carry the implicit floor', () => {
        assert.equal(usesConfiguredMinSamplesPerStratum({allocationStrategy: 'EQUAL'}), false)
        assert.equal(usesConfiguredMinSamplesPerStratum({manual: [true]}), false)
        assert.equal(usesConfiguredMinSamplesPerStratum({manual: true}), false)
        assert.equal(
            usesConfiguredMinSamplesPerStratum({allocationStrategy: 'EQUAL', manual: [true]}),
            false
        )
    })

    it('is true for the automatic strategies that expose the field', () => {
        for (const allocationStrategy of ['PROPORTIONAL', 'POWER', 'OPTIMAL']) {
            assert.equal(usesConfiguredMinSamplesPerStratum({allocationStrategy}), true)
            assert.equal(usesConfiguredMinSamplesPerStratum({allocationStrategy, manual: []}), true)
        }
    })
})

describe('effectiveMinSamplesPerStratum', () => {
    it('floors EQUAL allocation at 2 even when a lower minimum is configured', () => {
        assert.equal(
            effectiveMinSamplesPerStratum({allocationStrategy: 'EQUAL', minSamplesPerStratum: 1}),
            2
        )
        assert.equal(
            effectiveMinSamplesPerStratum({allocationStrategy: 'EQUAL', minSamplesPerStratum: 50}),
            2
        )
    })

    it('floors manual allocation at 2 regardless of the configured minimum', () => {
        assert.equal(
            effectiveMinSamplesPerStratum({manual: [true], minSamplesPerStratum: 1}),
            2
        )
        assert.equal(effectiveMinSamplesPerStratum({manual: true, minSamplesPerStratum: 50}), 2)
    })

    it('raises other automatic strategies to the configured minimum when it is higher', () => {
        assert.equal(
            effectiveMinSamplesPerStratum({allocationStrategy: 'PROPORTIONAL', minSamplesPerStratum: 10}),
            10
        )
        assert.equal(
            effectiveMinSamplesPerStratum({allocationStrategy: 'POWER', minSamplesPerStratum: '10'}),
            10
        )
    })

    it('never drops below 2 for a missing, zero, one or non-numeric configured minimum', () => {
        for (const minSamplesPerStratum of [undefined, null, '', 0, 1, -5, 'abc']) {
            assert.equal(
                effectiveMinSamplesPerStratum({allocationStrategy: 'PROPORTIONAL', minSamplesPerStratum}),
                2
            )
        }
    })
})

describe('isValidMinSamplesPerStratum', () => {
    it('rejects 0 and 1, and anything non-integer', () => {
        for (const value of [0, 1, -1, 1.5, '', undefined, null, 'abc']) {
            assert.equal(isValidMinSamplesPerStratum(value), false)
        }
    })

    it('accepts 2 and above, including numeric strings', () => {
        for (const value of [2, 3, 100, '2', '10']) {
            assert.equal(isValidMinSamplesPerStratum(value), true)
        }
    })
})

describe('isValidStratumSampleSize', () => {
    it('rejects a stratum requesting fewer than 2 samples', () => {
        for (const value of [0, 1, '', undefined, 1.5]) {
            assert.equal(isValidStratumSampleSize(value), false)
        }
    })

    it('accepts 2 and above', () => {
        assert.equal(isValidStratumSampleSize(2), true)
        assert.equal(isValidStratumSampleSize('37'), true)
    })
})

describe('minimumTotalSampleSize', () => {
    it('covers the effective minimum across every included stratum', () => {
        assert.equal(minimumTotalSampleSize({effectiveMinimum: 2, strataCount: 9}), 18)
        assert.equal(minimumTotalSampleSize({effectiveMinimum: 10, strataCount: 9}), 90)
    })

    it('requires 2 for an unstratified design (a single synthetic stratum)', () => {
        assert.equal(minimumTotalSampleSize({effectiveMinimum: 2, strataCount: 1}), 2)
    })
})
