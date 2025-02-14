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
