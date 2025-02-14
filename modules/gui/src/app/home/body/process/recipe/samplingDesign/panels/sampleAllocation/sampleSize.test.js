import {calculateSampleSize} from './sampleSize'
it('can calculate sample size', () => {
    expect(calculateSampleSize({
        marginOfError: 0.5,
        relativeMarginOfError: true,
        strategy: 'EQUAL',
        minSamplesPerStratum: 10,
        strata: [
            {stratum: 1, weight: 0.1, proportion: 0.5},
            {stratum: 2, weight: 0.9, proportion: 0.1},
        ],
        tuningConstant: 0.5,
        confidenceLevel: 0.95

    })).toEqual(213)
})
