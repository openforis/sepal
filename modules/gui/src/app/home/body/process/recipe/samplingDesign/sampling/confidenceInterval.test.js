import {calculateBounds} from './confidenceInterval'

it('correctly calculates confidence interval', () => {
    expect(calculateBounds({
        confidenceLevel: 0.95,
        allocation: [
            {stratum: 1, weight: 0.2, proportion: 0.6, sampleSize: 100},
            {stratum: 2, weight: 0.8, proportion: 0.1, sampleSize: 30},
        ]
    })).toEqual([
        0.13746074638919362,
        0.2,
        0.3426871245150406
    ])
})

it('produces a finite interval bracketing the proportion for a single stratum', () => {
    const [lower, proportion, upper] = calculateBounds({
        confidenceLevel: 0.95,
        allocation: [
            {stratum: 1, weight: 1, proportion: 0.5, sampleSize: 100},
        ]
    })
    expect(proportion).toBeCloseTo(0.5)
    expect(lower).toBeGreaterThan(0)
    expect(lower).toBeLessThan(0.5)
    expect(upper).toBeGreaterThan(0.5)
    expect(upper).toBeLessThan(1)
})
