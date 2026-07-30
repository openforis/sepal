import {retrieveButtonState} from './retrieveButtonState'

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
    },
    sampleArrangement: {arrangementStrategy: 'RANDOM', seed: 1}
}
const linked = {googleAccount: true, assetRoots: ['users/me']}

describe('retrieveButtonState', () => {
    it('enables a valid, fully capable design', () => {
        expect(retrieveButtonState({model: validModel, ...linked})).toEqual({disabled: false, kind: null, code: null})
    })

    it('reports the first model error (with args) before any capability check', () => {
        const model = {
            stratification: {skip: false, scale: 10, strata: [{value: 1, stratum: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 1}]},
            proportions: {skip: true},
            sampleAllocation: {
                allocationStrategy: 'PROPORTIONAL', minSamplesPerStratum: 2,
                allocation: [{stratum: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 1, sampleSize: 30}]
            },
            sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', minDistance: 1, seed: 1}
        }
        expect(retrieveButtonState({model, googleAccount: false, assetRoots: undefined}))
            .toEqual({disabled: true, kind: 'model', code: 'minDistanceBelowGrid', args: {value: 1, pixelSize: 10, minimum: 20}})
    })

    it('propagates a capability failure when the model is valid', () => {
        expect(retrieveButtonState({model: validModel, googleAccount: false, assetRoots: undefined}))
            .toEqual({disabled: true, kind: 'capability', code: 'noAccount'})
    })

    it('propagates the pending state while roots are unresolved', () => {
        expect(retrieveButtonState({model: validModel, googleAccount: true, assetRoots: undefined}))
            .toEqual({disabled: true, kind: 'capability', code: 'pending'})
    })
})
