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
        minSamplesPerStratum: 2,
        allocation: [
            {stratum: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 0.3, proportion: 0.48, sampleSize: 30},
            {stratum: 2, label: 'Non-forest', color: '#a00', area: 7e8, weight: 0.7, proportion: 0.08, sampleSize: 70}
        ]
    }
}

it('accepts a valid unstratified, no-proportions, manual design', () => {
    expect(validateRetrieve(unstratifiedValid)).toEqual([])
})

// The statistical floor, enforced at the same boundary the task preflight re-checks: the GUI must never
// approve a design the backend immediately rejects.
describe('minimum samples per stratum', () => {
    const withRow = sampleSize => ({
        ...stratifiedValid,
        sampleAllocation: {
            ...stratifiedValid.sampleAllocation,
            allocation: stratifiedValid.sampleAllocation.allocation.map((row, index) =>
                index === 0 ? {...row, sampleSize} : row)
        }
    })

    it('rejects a stratum allocated a single sample', () => {
        expect(codes(withRow(1))).toContain('sampleSizeInvalid')
    })

    it('rejects a stratum allocated zero samples', () => {
        expect(codes(withRow(0))).toContain('sampleSizeInvalid')
    })

    it('accepts a stratum allocated exactly the floor of two', () => {
        expect(codes(withRow(2))).not.toContain('sampleSizeInvalid')
    })

    it('rejects a missing minimum for automatic allocation', () => {
        const {minSamplesPerStratum: _omitted, ...withoutMinimum} = stratifiedValid.sampleAllocation
        expect(codes({...stratifiedValid, sampleAllocation: withoutMinimum}))
            .toContain('minSamplesPerStratumInvalid')
    })

    it('rejects a configured minimum below the floor for automatic allocation', () => {
        expect(codes({...stratifiedValid, sampleAllocation: {...stratifiedValid.sampleAllocation, minSamplesPerStratum: 1}}))
            .toContain('minSamplesPerStratumInvalid')
    })

    it('does not require a configured minimum for EQUAL or manual allocation, which floor at two', () => {
        expect(codes(unstratifiedValid)).not.toContain('minSamplesPerStratumInvalid')
        expect(codes({...stratifiedValid, sampleAllocation: {...stratifiedValid.sampleAllocation, allocationStrategy: 'EQUAL', minSamplesPerStratum: undefined}}))
            .not.toContain('minSamplesPerStratumInvalid')
    })
})

it('accepts a valid stratified design with proportions', () => {
    expect(validateRetrieve(stratifiedValid)).toEqual([])
})

it('reports noStrata when stratification has no strata', () => {
    expect(codes({...stratifiedValid, stratification: {}})).toContain('noStrata')
})

it('reports strataAreaMissing when a STRATIFIED stratum lacks a finite area', () => {
    const model = {...stratifiedValid, stratification: {strata: [{value: 1, weight: 1}]}}
    expect(codes(model)).toContain('strataAreaMissing')
})

it('accepts an UNSTRATIFIED design (skip) whose synthetic stratum/allocation have no area yet', () => {
    // Area is filled at the export boundary from the AOI geometry, so a missing area must not block Done.
    const unstratifiedNoArea = {
        stratification: {skip: true, strata: [{value: 1, stratum: 1, label: 'Area of interest', color: '#000000', weight: 1}]},
        proportions: {skip: true},
        sampleAllocation: {
            manual: [true],
            allocationStrategy: 'EQUAL',
            allocation: [{stratum: 1, label: 'Area of interest', color: '#000000', weight: 1, sampleSize: 100}]
        }
    }
    expect(validateRetrieve(unstratifiedNoArea)).toEqual([])
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

describe('stale sections (requiresUpdate)', () => {
    const stale = section => ({
        ...stratifiedValid,
        [section]: {...(stratifiedValid[section] || {}), requiresUpdate: true}
    })

    it.each(['stratification', 'proportions', 'sampleAllocation', 'sampleArrangement'])(
        'reports requiresUpdate for a stale %s section',
        section => {
            expect(validateRetrieve(stale(section))).toContainEqual({section, code: 'requiresUpdate'})
        }
    )

    it('accepts a complete design with all requiresUpdate flags false', () => {
        const model = {
            ...stratifiedValid,
            stratification: {...stratifiedValid.stratification, requiresUpdate: false},
            proportions: {...stratifiedValid.proportions, requiresUpdate: false},
            sampleAllocation: {...stratifiedValid.sampleAllocation, requiresUpdate: false},
            sampleArrangement: {requiresUpdate: false}
        }
        expect(validateRetrieve(model)).toEqual([])
    })

    it('rejects a stale but otherwise-complete design, reporting the stale section first', () => {
        const model = {...stratifiedValid, stratification: {...stratifiedValid.stratification, requiresUpdate: true}}
        expect(validateRetrieve(model)).not.toEqual([])
        expect(validateRetrieve(model)[0]).toEqual({section: 'stratification', code: 'requiresUpdate'})
    })
})

// Same raster floor at the submission boundary, so the GUI cannot approve a design the task rejects.
describe('stratified systematic minimum distance vs the stratification grid', () => {
    const withGrid = ({minDistance, scale = 10, skip, arrangementStrategy = 'SYSTEMATIC'}) => ({
        ...stratifiedValid,
        stratification: {...stratifiedValid.stratification, scale, skip},
        sampleArrangement: {arrangementStrategy, sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', minDistance, seed: 1}
    })

    it('rejects below the floor and accepts at or above it', () => {
        expect(codes(withGrid({minDistance: 19}))).toContain('minDistanceBelowGrid')
        expect(codes(withGrid({minDistance: 20}))).not.toContain('minDistanceBelowGrid')
    })

    it('invalidates a previously valid distance when the grid coarsens', () => {
        expect(codes(withGrid({minDistance: 20, scale: 30}))).toContain('minDistanceBelowGrid')
    })

    it('does not apply the raster floor to unstratified systematic or to random', () => {
        expect(codes(withGrid({minDistance: 5, skip: true}))).not.toContain('minDistanceBelowGrid')
        expect(codes(withGrid({minDistance: 5, arrangementStrategy: 'RANDOM'}))).not.toContain('minDistanceBelowGrid')
    })

    // Both skip representations must be read identically: a legacy [true] means UNSTRATIFIED, so the floor
    // must not fail an otherwise valid unstratified export.
    it('reads every skip representation consistently', () => {
        for (const skip of [false, [], undefined]) {
            expect(codes(withGrid({minDistance: 19, skip}))).toContain('minDistanceBelowGrid')
        }
        for (const skip of [true, [true]]) {
            expect(codes(withGrid({minDistance: 19, skip}))).not.toContain('minDistanceBelowGrid')
        }
    })
})

// Retrieve errors may carry message arguments so the user sees exact numbers instead of generic wording.
// Errors without arguments must keep their existing {section, code} shape.
describe('error arguments', () => {
    const firstError = model => validateRetrieve(model).find(({code}) => code === 'minDistanceBelowGrid')

    it('carries value, pixelSize and minimum for a below-floor minimum distance', () => {
        const error = firstError({
            ...stratifiedValid,
            stratification: {...stratifiedValid.stratification, scale: 10},
            sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', minDistance: 1, seed: 1}
        })
        expect(error.args).toEqual({value: 1, pixelSize: 10, minimum: 20})
    })

    it('reports the coarser grid numbers when the grid changes', () => {
        const error = firstError({
            ...stratifiedValid,
            stratification: {...stratifiedValid.stratification, scale: 30},
            sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', minDistance: 20, seed: 1}
        })
        expect(error.args).toEqual({value: 20, pixelSize: 30, minimum: 60})
    })

    it('omits args entirely for errors that have no exact values to report', () => {
        const [error] = validateRetrieve({})
        expect(error).toEqual({section: expect.any(String), code: expect.any(String)})
        expect('args' in error).toBe(false)
    })

    it('produces no minimum-distance error for a blank distance', () => {
        expect(firstError({
            ...stratifiedValid,
            stratification: {...stratifiedValid.stratification, scale: 10},
            sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', minDistance: '', seed: 1}
        })).toBeUndefined()
    })
})

// The message names Equal, Proportional and Balanced as the proportion-free alternatives, so those three must
// actually pass without anticipated proportions.
describe('allocation strategies that do not need anticipated proportions', () => {
    const withStrategy = allocationStrategy => codes({
        ...stratifiedValid,
        proportions: {skip: true},
        sampleAllocation: {...stratifiedValid.sampleAllocation, allocationStrategy, estimateSampleSize: false}
    })

    it('accepts Equal, Proportional and Balanced without proportions', () => {
        for (const strategy of ['EQUAL', 'PROPORTIONAL', 'BALANCED']) {
            expect(withStrategy(strategy)).not.toContain('proportionsRequired')
        }
    })

    it('still requires proportions for the variance-based strategies', () => {
        for (const strategy of ['OPTIMAL', 'POWER']) {
            expect(withStrategy(strategy)).toContain('proportionsRequired')
        }
    })
})
