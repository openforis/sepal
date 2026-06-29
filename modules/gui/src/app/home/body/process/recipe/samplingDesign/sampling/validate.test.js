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
        minSamplesPerStratum: 1,
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
            allocationStrategy: 'PROPORTIONAL', minSamplesPerStratum: 1
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
            allocationStrategy: 'OPTIMAL', minSamplesPerStratum: 1
        },
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER'},
        samplingDesignDerived: {areaByStratum: {1: 300, 2: 700}}
    })
    expect(codes(result)).toContain('allocationInvalid')
})
