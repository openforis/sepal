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
        expect(MIN_SAMPLES_PER_STRATUM).toBe(2)
    })
})

// The single decision behind the panel's field visibility, both GUI validators and the task preflight.
describe('usesConfiguredMinSamplesPerStratum', () => {
    it('is false for EQUAL and manual allocation, which carry the implicit floor', () => {
        expect(usesConfiguredMinSamplesPerStratum({allocationStrategy: 'EQUAL'})).toBe(false)
        expect(usesConfiguredMinSamplesPerStratum({manual: [true]})).toBe(false)
        expect(usesConfiguredMinSamplesPerStratum({manual: true})).toBe(false)
        expect(usesConfiguredMinSamplesPerStratum({allocationStrategy: 'EQUAL', manual: [true]})).toBe(false)
    })

    it('is true for the automatic strategies that expose the field', () => {
        for (const allocationStrategy of ['PROPORTIONAL', 'POWER', 'OPTIMAL']) {
            expect(usesConfiguredMinSamplesPerStratum({allocationStrategy})).toBe(true)
            expect(usesConfiguredMinSamplesPerStratum({allocationStrategy, manual: []})).toBe(true)
        }
    })
})

describe('effectiveMinSamplesPerStratum', () => {
    it('floors EQUAL allocation at 2 even when a lower minimum is configured', () => {
        expect(effectiveMinSamplesPerStratum({allocationStrategy: 'EQUAL', minSamplesPerStratum: 1})).toBe(2)
        expect(effectiveMinSamplesPerStratum({allocationStrategy: 'EQUAL', minSamplesPerStratum: 50})).toBe(2)
    })

    it('floors manual allocation at 2 regardless of the configured minimum', () => {
        expect(effectiveMinSamplesPerStratum({manual: [true], minSamplesPerStratum: 1})).toBe(2)
        expect(effectiveMinSamplesPerStratum({manual: true, minSamplesPerStratum: 50})).toBe(2)
    })

    it('raises other automatic strategies to the configured minimum when it is higher', () => {
        expect(effectiveMinSamplesPerStratum({allocationStrategy: 'PROPORTIONAL', minSamplesPerStratum: 10})).toBe(10)
        expect(effectiveMinSamplesPerStratum({allocationStrategy: 'POWER', minSamplesPerStratum: '10'})).toBe(10)
    })

    it('never drops below 2 for a missing, zero, one or non-numeric configured minimum', () => {
        for (const minSamplesPerStratum of [undefined, null, '', 0, 1, -5, 'abc']) {
            expect(effectiveMinSamplesPerStratum({allocationStrategy: 'PROPORTIONAL', minSamplesPerStratum})).toBe(2)
        }
    })
})

describe('isValidMinSamplesPerStratum', () => {
    it('rejects 0 and 1, and anything non-integer', () => {
        for (const value of [0, 1, -1, 1.5, '', undefined, null, 'abc']) {
            expect(isValidMinSamplesPerStratum(value)).toBe(false)
        }
    })

    it('accepts 2 and above, including numeric strings', () => {
        for (const value of [2, 3, 100, '2', '10']) {
            expect(isValidMinSamplesPerStratum(value)).toBe(true)
        }
    })
})

describe('isValidStratumSampleSize', () => {
    it('rejects a stratum requesting fewer than 2 samples', () => {
        for (const value of [0, 1, '', undefined, 1.5]) {
            expect(isValidStratumSampleSize(value)).toBe(false)
        }
    })

    it('accepts 2 and above', () => {
        expect(isValidStratumSampleSize(2)).toBe(true)
        expect(isValidStratumSampleSize('37')).toBe(true)
    })
})

describe('minimumTotalSampleSize', () => {
    it('covers the effective minimum across every included stratum', () => {
        expect(minimumTotalSampleSize({effectiveMinimum: 2, strataCount: 9})).toBe(18)
        expect(minimumTotalSampleSize({effectiveMinimum: 10, strataCount: 9})).toBe(90)
    })

    it('requires 2 for an unstratified design (a single synthetic stratum)', () => {
        expect(minimumTotalSampleSize({effectiveMinimum: 2, strataCount: 1})).toBe(2)
    })
})
