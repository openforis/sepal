import {boundsToMarginOfError, calculateMarginOfError} from './marginOfError'

it('always returns the relative margin, ignoring a stale relative:false flag', () => {
    expect(boundsToMarginOfError({bounds: [0.1, 0.2, 0.35], relative: false})).toBeCloseTo(0.75)
})

it('is Infinity (not NaN) when the overall proportion is zero', () => {
    expect(boundsToMarginOfError({bounds: [0, 0, 0]})).toBe(Infinity)
})

it('calculateMarginOfError is Infinity (not NaN) at all-zero proportions', () => {
    expect(calculateMarginOfError({
        sampleSize: 100,
        confidenceLevel: 0.95,
        strategy: 'EQUAL',
        minSamplesPerStratum: 2,
        strata: [
            {stratum: 1, weight: 0.5, proportion: 0},
            {stratum: 2, weight: 0.5, proportion: 0},
        ],
        tuningConstant: 0.5
    })).toBe(Infinity)
})
