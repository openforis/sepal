import {MIN_SAMPLES_PER_STRATUM} from '#sepal/recipe/samplingDesign/minSamples'

import {getDefaultModel} from './defaultModel'

describe('getDefaultModel().stratification', () => {
    it('defaults the stratification CRS to EPSG:6933', () => {
        expect(getDefaultModel().stratification.crs).toBe('EPSG:6933')
    })
})

describe('getDefaultModel().sampleArrangement', () => {
    it('provides a complete set of Sample Arrangement defaults', () => {
        expect(getDefaultModel().sampleArrangement).toEqual({
            requiresUpdate: false,
            arrangementStrategy: 'RANDOM',
            sampleSizeStrategy: 'OVER',
            gridOrigin: 'FIXED',
            crs: 'EPSG:6933',
            seed: 1
        })
    })

    // Sample Arrangement no longer owns Scale: the stratified grid comes from Stratification, and unstratified
    // Systematic is analytical (CRS-only).
    it('does not persist a Sample Arrangement scale', () => {
        expect('scale' in getDefaultModel().sampleArrangement).toBe(false)
    })

    // Minimum distance is optional and grid-derived: persisting a value would freeze it against the grid it was
    // created with, so an unset default is resolved to the grid floor at export instead.
    it('does not persist a default minimum distance', () => {
        expect('minDistance' in getDefaultModel().sampleArrangement).toBe(false)
    })
})

describe('getDefaultModel().sampleAllocation', () => {
    // A new recipe is automatic, fixed-size and Balanced. Balanced spreads a total over the strata from
    // their identities and weights alone, so it is the one automatic strategy that already means something
    // before anyone has anticipated a proportion.
    it('starts a new recipe automatic, fixed-size and Balanced', () => {
        expect(getDefaultModel().sampleAllocation).toMatchObject({
            requiresUpdate: false,
            manual: [],
            estimateSampleSize: false,
            allocationStrategy: 'BALANCED'
        })
    })

    // The total is the one number the design cannot derive, and the counts follow from it. Inventing either
    // would produce a design nobody chose that Retrieve would accept.
    it('supplies neither a total sample size nor any counts', () => {
        const {sampleAllocation} = getDefaultModel()
        expect('sampleSize' in sampleAllocation).toBe(false)
        expect('allocation' in sampleAllocation).toBe(false)
    })

    it('carries the confidence, minimum-samples, power-tuning and dormant margin defaults', () => {
        expect(getDefaultModel().sampleAllocation).toMatchObject({
            confidenceLevel: 95,
            marginOfError: 50,
            minSamplesPerStratum: String(MIN_SAMPLES_PER_STRATUM),
            powerTuningConstant: '0.5'
        })
    })

    // Two recipes open at once must not share one array to push into.
    it('does not carry a mutation from one recipe into the next', () => {
        getDefaultModel().sampleAllocation.manual.push(true)
        expect(getDefaultModel().sampleAllocation.manual).toEqual([])
    })

})
