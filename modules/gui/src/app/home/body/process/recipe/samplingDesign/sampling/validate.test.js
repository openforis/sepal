import {validateSamplingDesign} from './validate'

const baseModel = {
    stratification: {
        legendByStratum: {1: {label: 'Forest', color: '#0a0'}, 2: {label: 'Non-forest', color: '#a00'}}
    },
    proportions: {
        manual: false,
        percentage: false,
        anticipatedOverallProportion: 0.2
    },
    sampleAllocation: {
        manual: false,
        estimateSampleSize: false,
        sampleSize: 100,
        allocationStrategy: 'PROPORTIONAL',
        minSamplesPerStratum: 2,
        confidenceLevel: 95,
        marginOfError: 50,
        relativeMarginOfError: true,
        powerTuningConstant: 0.5
    },
    sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER'},
    samplingDesignDerived: {areaByStratum: {1: 300, 2: 700}, probabilityByStratum: {1: 0.6, 2: 0.1}}
}

const codes = result => result.errors.map(({code}) => code)

it('accepts a complete, consistent design', () => {
    const result = validateSamplingDesign(baseModel)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
})

it('reports strataNotComputed before areas are derived', () => {
    const result = validateSamplingDesign({...baseModel, samplingDesignDerived: {}})
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([{section: 'stratification', code: 'strataNotComputed'}])
})

it('rejects manual proportions outside [0, 1]', () => {
    const result = validateSamplingDesign({
        ...baseModel,
        proportions: {manual: true, manualProportionByStratum: {1: 1.5, 2: 0.1}}
    })
    expect(codes(result)).toContain('proportionOutOfRange')
})

it('rejects an infeasible allocation (relative margin of error at zero proportions -> NaN sizes)', () => {
    const result = validateSamplingDesign({
        ...baseModel,
        proportions: {manual: false, percentage: false, anticipatedOverallProportion: 0.2},
        sampleAllocation: {...baseModel.sampleAllocation, estimateSampleSize: true},
        samplingDesignDerived: {areaByStratum: {1: 300, 2: 700}, probabilityByStratum: {1: 0, 2: 0}}
    })
    expect(codes(result)).toContain('allocationInvalid')
})

it('requires a seed when the arrangement is RANDOM', () => {
    const result = validateSamplingDesign({
        ...baseModel,
        sampleArrangement: {arrangementStrategy: 'RANDOM', sampleSizeStrategy: 'OVER'}
    })
    expect(codes(result)).toContain('seedMissing')
})

it('does not require a seed for SYSTEMATIC/OVER', () => {
    expect(codes(validateSamplingDesign(baseModel))).not.toContain('seedMissing')
})

it('requires a seed for SYSTEMATIC with a seeded grid origin', () => {
    const result = validateSamplingDesign({
        ...baseModel,
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'SEEDED'}
    })
    expect(codes(result)).toContain('seedMissing')
})

it('does not require a seed for SYSTEMATIC/OVER with a fixed grid origin', () => {
    const result = validateSamplingDesign({
        ...baseModel,
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED'}
    })
    expect(codes(result)).not.toContain('seedMissing')
})

it('skips proportion validation when proportions are skipped', () => {
    const result = validateSamplingDesign({
        ...baseModel,
        proportions: {skip: true}
    })
    expect(codes(result)).not.toContain('proportionsNotComputed')
    expect(codes(result)).not.toContain('proportionOutOfRange')
})

it('accepts a no-proportions design with PROPORTIONAL allocation and a fixed sample size', () => {
    const result = validateSamplingDesign({
        stratification: {legendByStratum: {1: {label: 'Forest', color: '#0a0'}, 2: {label: 'Non-forest', color: '#a00'}}},
        proportions: {skip: true},
        sampleAllocation: {
            manual: false, estimateSampleSize: false, sampleSize: 100,
            allocationStrategy: 'PROPORTIONAL', minSamplesPerStratum: 2
        },
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER'},
        samplingDesignDerived: {areaByStratum: {1: 300, 2: 700}}
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
})

it('rejects a no-proportions design that asks for OPTIMAL allocation', () => {
    const result = validateSamplingDesign({
        stratification: {legendByStratum: {1: {label: 'Forest', color: '#0a0'}, 2: {label: 'Non-forest', color: '#a00'}}},
        proportions: {skip: true},
        sampleAllocation: {
            manual: false, estimateSampleSize: false, sampleSize: 100,
            allocationStrategy: 'OPTIMAL', minSamplesPerStratum: 2
        },
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER'},
        samplingDesignDerived: {areaByStratum: {1: 300, 2: 700}}
    })
    expect(codes(result)).toContain('allocationInvalid')
})

// The derived view applies the effective floor, so an invalid configured minimum must be caught explicitly -
// otherwise the clean model reports valid while validateRetrieve and the task preflight reject it.
describe('configured minimum on the clean model', () => {
    const automatic = minSamplesPerStratum => ({
        stratification: {legendByStratum: {1: {label: 'Forest', color: '#0a0'}, 2: {label: 'Non-forest', color: '#a00'}}},
        proportions: {skip: true},
        sampleAllocation: {
            manual: false, estimateSampleSize: false, sampleSize: 100,
            allocationStrategy: 'PROPORTIONAL', minSamplesPerStratum
        },
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER'},
        samplingDesignDerived: {areaByStratum: {1: 300, 2: 700}}
    })
    const codesOf = model => validateSamplingDesign(model).errors.map(({code}) => code)

    it('rejects a configured minimum of 1 for automatic allocation', () => {
        expect(codesOf(automatic(1))).toContain('minSamplesPerStratumInvalid')
    })

    it('rejects a missing configured minimum for automatic allocation', () => {
        expect(codesOf(automatic(undefined))).toContain('minSamplesPerStratumInvalid')
    })

    it('accepts a configured minimum of 2', () => {
        expect(codesOf(automatic(2))).not.toContain('minSamplesPerStratumInvalid')
    })

    it('exempts EQUAL and manual allocation, which carry the implicit floor', () => {
        const equal = {...automatic(undefined), sampleAllocation: {...automatic(undefined).sampleAllocation, allocationStrategy: 'EQUAL'}}
        expect(codesOf(equal)).not.toContain('minSamplesPerStratumInvalid')
        const manual = {...automatic(undefined), sampleAllocation: {...automatic(undefined).sampleAllocation, manual: true}}
        expect(codesOf(manual)).not.toContain('minSamplesPerStratumInvalid')
    })
})

// A stratified systematic lattice sits on the stratification grid, so samples can never be closer than two grid
// pixels. The candidate generator clamps internally, so without this the user's value would be silently raised.
describe('stratified systematic minimum distance vs the stratification grid', () => {
    const model = ({minDistance, scale = 10, skip = false, arrangementStrategy = 'SYSTEMATIC'}) => ({
        stratification: {skip, scale, legendByStratum: {1: {label: 'Forest', color: '#0a0'}}},
        proportions: {skip: true},
        sampleAllocation: {
            manual: false, estimateSampleSize: false, sampleSize: 100,
            allocationStrategy: 'PROPORTIONAL', minSamplesPerStratum: 2
        },
        sampleArrangement: {arrangementStrategy, sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', minDistance, seed: 1},
        samplingDesignDerived: {areaByStratum: {1: 1000}}
    })
    const codesOf = args => validateSamplingDesign(model(args)).errors.map(({code}) => code)

    it('rejects below the floor and accepts at or above it on a 10 m scale grid', () => {
        expect(codesOf({minDistance: 19})).toContain('minDistanceBelowGrid')
        expect(codesOf({minDistance: 20})).not.toContain('minDistanceBelowGrid')
        expect(codesOf({minDistance: 60})).not.toContain('minDistanceBelowGrid')
    })

    it('invalidates a previously valid distance when the grid coarsens', () => {
        expect(codesOf({minDistance: 20, scale: 10})).not.toContain('minDistanceBelowGrid')
        expect(codesOf({minDistance: 20, scale: 30})).toContain('minDistanceBelowGrid')
    })

    it('does not apply the raster floor to unstratified systematic, which is analytical', () => {
        expect(codesOf({minDistance: 5, skip: true})).not.toContain('minDistanceBelowGrid')
    })

    // Both skip representations must be read identically: a legacy [] means STRATIFIED, so the floor applies.
    it('reads every skip representation consistently', () => {
        for (const skip of [false, [], undefined]) {
            expect(codesOf({minDistance: 19, skip})).toContain('minDistanceBelowGrid')
        }
        for (const skip of [true, [true]]) {
            expect(codesOf({minDistance: 19, skip})).not.toContain('minDistanceBelowGrid')
        }
    })

    it('leaves random sampling unaffected', () => {
        expect(codesOf({minDistance: 5, arrangementStrategy: 'RANDOM'})).not.toContain('minDistanceBelowGrid')
    })
})
