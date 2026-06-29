import {boundsToMarginOfError, calculateMarginOfError} from './marginOfError'

it('absolute margin of error is the larger half-width', () => {
    expect(boundsToMarginOfError({
        bounds: [0.1, 0.2, 0.35],
        relative: false
    })).toBeCloseTo(0.15)
})

it('relative margin of error divides the half-width by the proportion', () => {
    expect(boundsToMarginOfError({
        bounds: [0.1, 0.2, 0.35],
        relative: true
    })).toBeCloseTo(0.75)
})

it('relative margin of error is Infinity (not NaN) when the proportion is zero', () => {
    expect(boundsToMarginOfError({
        bounds: [0, 0, 0],
        relative: true
    })).toBe(Infinity)
})

it('calculateMarginOfError is Infinity (not NaN) for relative MOE at all-zero proportions', () => {
    expect(calculateMarginOfError({
        sampleSize: 100,
        relativeMarginOfError: true,
        confidenceLevel: 0.95,
        strategy: 'EQUAL',
        minSamplesPerStratum: 1,
        strata: [
            {stratum: 1, weight: 0.5, proportion: 0},
            {stratum: 2, weight: 0.5, proportion: 0},
        ],
        tuningConstant: 0.5
    })).toBe(Infinity)
})
