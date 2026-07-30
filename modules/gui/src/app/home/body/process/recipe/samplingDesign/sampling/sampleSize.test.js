import {calculateMarginOfError} from './marginOfError'
import {calculateSampleSize} from './sampleSize'

const common = {
    relativeMarginOfError: true,
    strategy: 'EQUAL',
    minSamplesPerStratum: 10,
    tuningConstant: 0.5,
    confidenceLevel: 0.95
}

const strata = [
    {stratum: 1, weight: 0.1, proportion: 0.5},
    {stratum: 2, weight: 0.9, proportion: 0.1},
]

const moeAt = sampleSize => calculateMarginOfError({...common, sampleSize, strata})

it('returns the first integer sample size whose allocation meets the target margin of error', () => {
    const target = 0.5
    const n = calculateSampleSize({...common, marginOfError: target, strata})
    expect(Number.isFinite(n)).toBe(true)
    expect(moeAt(n)).toBeLessThanOrEqual(target)
    expect(moeAt(n - 1)).toBeGreaterThan(target)
})

it('treats relative margin of error at all-zero proportions as infeasible (Infinity)', () => {
    const n = calculateSampleSize({
        ...common,
        marginOfError: 0.5,
        strata: [
            {stratum: 1, weight: 0.5, proportion: 0},
            {stratum: 2, weight: 0.5, proportion: 0},
        ]
    })
    expect(n).toBe(Infinity)
})
