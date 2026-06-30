import {validateRetrieve} from './validateRetrieve'

const codes = model => validateRetrieve(model).map(({code}) => code)

// Valid unstratified + skipped proportions + manual allocation (the auto-unstratified happy path).
const unstratifiedValid = {
    stratification: {skip: true, strata: [{value: 1, stratum: 1, label: 'Area of interest', color: '#000000', area: 1.2e9, weight: 1}]},
    proportions: {skip: true},
    sampleAllocation: {
        manual: [true],
        allocationStrategy: 'EQUAL',
        allocation: [{stratum: 1, label: 'Area of interest', color: '#000000', area: 1.2e9, weight: 1, sampleSize: 100}]
    }
}

// Valid stratified + proportions + OPTIMAL (the classic happy path).
const stratifiedValid = {
    stratification: {strata: [
        {value: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 0.3},
        {value: 2, label: 'Non-forest', color: '#a00', area: 7e8, weight: 0.7}
    ]},
    proportions: {anticipatedProportions: [{stratum: 1, proportion: 0.48}, {stratum: 2, proportion: 0.08}]},
    sampleAllocation: {
        allocationStrategy: 'OPTIMAL',
        allocation: [
            {stratum: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 0.3, proportion: 0.48, sampleSize: 30},
            {stratum: 2, label: 'Non-forest', color: '#a00', area: 7e8, weight: 0.7, proportion: 0.08, sampleSize: 70}
        ]
    }
}

it('accepts a valid unstratified, no-proportions, manual design', () => {
    expect(validateRetrieve(unstratifiedValid)).toEqual([])
})

it('accepts a valid stratified design with proportions', () => {
    expect(validateRetrieve(stratifiedValid)).toEqual([])
})

it('reports noStrata when stratification has no strata', () => {
    expect(codes({...stratifiedValid, stratification: {}})).toContain('noStrata')
})

it('reports strataAreaMissing when a stratum lacks a finite area', () => {
    const model = {...stratifiedValid, stratification: {strata: [{value: 1, weight: 1}]}}
    expect(codes(model)).toContain('strataAreaMissing')
})

it('reports noAllocation when there is no allocation', () => {
    expect(codes({...unstratifiedValid, sampleAllocation: {}})).toContain('noAllocation')
})

it('reports sampleSizeInvalid when an allocation row has a blank sample size', () => {
    const model = {
        ...unstratifiedValid,
        sampleAllocation: {...unstratifiedValid.sampleAllocation, allocation: [{stratum: 1, area: 1.2e9, sampleSize: ''}]}
    }
    expect(codes(model)).toContain('sampleSizeInvalid')
})

it('reports sampleSizeInvalid for a non-integer sample size', () => {
    const model = {
        ...unstratifiedValid,
        sampleAllocation: {...unstratifiedValid.sampleAllocation, allocation: [{stratum: 1, area: 1.2e9, sampleSize: 5.5}]}
    }
    expect(codes(model)).toContain('sampleSizeInvalid')
})

it('reports areaMissing when a task row resolves without a finite area', () => {
    // stratum 2 is allocated but absent from strata, so toTaskAllocation leaves its area undefined.
    const model = {
        stratification: {strata: [{value: 1, label: 'A', color: '#000', area: 1e9, weight: 1}]},
        proportions: {skip: true},
        sampleAllocation: {allocationStrategy: 'EQUAL', allocation: [{stratum: 2, sampleSize: 50}]}
    }
    expect(codes(model)).toContain('areaMissing')
})

it('reports proportionsRequired for OPTIMAL when proportions are skipped', () => {
    const model = {...unstratifiedValid, sampleAllocation: {...unstratifiedValid.sampleAllocation, allocationStrategy: 'OPTIMAL'}}
    expect(codes(model)).toContain('proportionsRequired')
})

it('reports proportionsRequired for POWER when proportions are skipped', () => {
    const model = {...unstratifiedValid, sampleAllocation: {...unstratifiedValid.sampleAllocation, allocationStrategy: 'POWER'}}
    expect(codes(model)).toContain('proportionsRequired')
})

it('reports proportionsRequired for sample-size estimation when proportions are skipped', () => {
    const model = {...unstratifiedValid, sampleAllocation: {...unstratifiedValid.sampleAllocation, estimateSampleSize: true}}
    expect(codes(model)).toContain('proportionsRequired')
})

it('rejects a row with zero samples (backend divides by the sample size)', () => {
    const model = {
        ...unstratifiedValid,
        sampleAllocation: {...unstratifiedValid.sampleAllocation, allocation: [{stratum: 1, area: 1.2e9, sampleSize: 0}]}
    }
    expect(codes(model)).toContain('sampleSizeInvalid')
})

it('rejects a stratified design where one stratum has zero samples and another is positive', () => {
    const model = {
        ...stratifiedValid,
        sampleAllocation: {
            ...stratifiedValid.sampleAllocation,
            allocation: [
                {stratum: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 0.3, proportion: 0.48, sampleSize: 0},
                {stratum: 2, label: 'Non-forest', color: '#a00', area: 7e8, weight: 0.7, proportion: 0.08, sampleSize: 70}
            ]
        }
    }
    expect(validateRetrieve(model)).not.toEqual([])
    expect(codes(model)).toContain('sampleSizeInvalid')
})

it('reports a single section:code at most once', () => {
    const result = validateRetrieve({stratification: {}, proportions: {}, sampleAllocation: {}})
    const keys = result.map(({section, code}) => `${section}:${code}`)
    expect(keys.length).toBe(new Set(keys).size)
})

const withArrangement = sampleArrangement => ({...stratifiedValid, sampleArrangement})

it('requires a seed for RANDOM arrangement', () => {
    expect(codes(withArrangement({arrangementStrategy: 'RANDOM'}))).toContain('seedMissing')
})

it('requires a seed for SYSTEMATIC/EXACT thinning', () => {
    expect(codes(withArrangement({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'EXACT'}))).toContain('seedMissing')
})

it('requires a seed for SYSTEMATIC with a seeded grid origin', () => {
    expect(codes(withArrangement({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'SEEDED'}))).toContain('seedMissing')
})

it('does not require a seed for SYSTEMATIC/OVER with a fixed grid origin', () => {
    expect(codes(withArrangement({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED'}))).not.toContain('seedMissing')
})

it('accepts a valid integer seed when one is required', () => {
    expect(codes(withArrangement({arrangementStrategy: 'RANDOM', seed: 1}))).not.toContain('seedMissing')
})

it('rejects a non-integer seed when one is required', () => {
    expect(codes(withArrangement({arrangementStrategy: 'RANDOM', seed: 1.5}))).toContain('seedMissing')
})
