import {retrieveButtonState} from './retrieveButtonState'

// A retrievable design (mirrors the valid stratified happy path used by validateRetrieve).
const validModel = {
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

describe('retrieveButtonState', () => {
    it('enables the button for a valid design (no code)', () => {
        expect(retrieveButtonState(validModel)).toEqual({disabled: false, code: null})
    })

    it('disables the button for a stale section, selecting the requiresUpdate detail', () => {
        const model = {...validModel, sampleAllocation: {...validModel.sampleAllocation, requiresUpdate: true}}
        expect(retrieveButtonState(model)).toEqual({disabled: true, code: 'requiresUpdate'})
    })

    it('disables the button for a content error, selecting the first preflight code', () => {
        const model = {...validModel, stratification: {}}
        expect(retrieveButtonState(model)).toEqual({disabled: true, code: 'noStrata'})
    })
})

// The disabled-button tooltip states exact numbers, so the helper must preserve the first error's arguments.
describe('error arguments', () => {
    it('preserves the first error arguments alongside its code', () => {
        const {disabled, code, args} = retrieveButtonState({
            stratification: {skip: false, scale: 10, strata: [{value: 1, stratum: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 1}]},
            proportions: {skip: true},
            sampleAllocation: {
                allocationStrategy: 'PROPORTIONAL', minSamplesPerStratum: 2,
                allocation: [{stratum: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 1, sampleSize: 30}]
            },
            sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', minDistance: 1, seed: 1}
        })
        expect(disabled).toBe(true)
        expect(code).toBe('minDistanceBelowGrid')
        expect(args).toEqual({value: 1, pixelSize: 10, minimum: 20})
    })

    it('reports no arguments for a retrievable design', () => {
        const {disabled, args} = retrieveButtonState({
            stratification: {skip: false, scale: 10, strata: [{value: 1, stratum: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 1}]},
            proportions: {skip: true},
            sampleAllocation: {
                allocationStrategy: 'PROPORTIONAL', minSamplesPerStratum: 2,
                allocation: [{stratum: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 1, sampleSize: 30}]
            },
            sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', minDistance: 60, seed: 1}
        })
        expect(disabled).toBe(false)
        expect(args).toBeUndefined()
    })
})
