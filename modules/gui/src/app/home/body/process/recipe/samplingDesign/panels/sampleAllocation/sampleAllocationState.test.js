import {shouldDeferFixedSampleSizeAllocation} from './sampleAllocationState'

it('defers allocation for automatic fixed-sample mode until a valid sample size exists', () => {
    expect(shouldDeferFixedSampleSizeAllocation({
        manual: [],
        estimateSampleSize: false,
        sampleSize: ''
    })).toBe(true)
    expect(shouldDeferFixedSampleSizeAllocation({
        manual: [],
        estimateSampleSize: false,
        sampleSize: '0'
    })).toBe(true)
    expect(shouldDeferFixedSampleSizeAllocation({
        manual: [],
        estimateSampleSize: false,
        sampleSize: '100'
    })).toBe(false)
})

it('does not defer manual or margin-of-error target modes', () => {
    expect(shouldDeferFixedSampleSizeAllocation({
        manual: [true],
        estimateSampleSize: false,
        sampleSize: ''
    })).toBe(false)
    expect(shouldDeferFixedSampleSizeAllocation({
        manual: [],
        estimateSampleSize: true,
        sampleSize: ''
    })).toBe(false)
})
