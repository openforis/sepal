import {MIN_SAMPLES_PER_STRATUM} from '#sepal/recipe/samplingDesign/minSamples'

import {getDefaultModel} from './defaultModel'

describe('getDefaultModel().stratification', () => {
    // The Stratification grid is now a visible, persisted pair of fields rather than a fallback, so a new
    // recipe shows what it will actually use. It interprets a categorical source, so it starts from the plain
    // geographic CRS - not the equal-area grid the Sample Arrangement places points on - and matches what a
    // recipe source or a source with no usable grid metadata resolves to.
    it('starts a new design on EPSG:4326 at 30 m', () => {
        expect(getDefaultModel().stratification).toMatchObject({crs: 'EPSG:4326', scale: 30})
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

    // The total is the one number the design cannot derive, and the counts follow from it. Inventing one
    // would produce a design nobody chose that Retrieve would accept.
    it('supplies no total sample size', () => {
        expect('sampleSize' in getDefaultModel().sampleAllocation).toBe(false)
    })

    // No counts either - but "no counts" is an empty list, not a missing field. Everything that reads an
    // allocation reads it as rows: the panel renders them, reconciles them against the strata and rewrites
    // them for manual mode, and a field the model does not carry reaches the form as '' instead.
    it('starts with no counts, as an empty list', () => {
        expect(getDefaultModel().sampleAllocation.allocation).toEqual([])
    })

    // A factory rather than a shared literal: two recipes open at once must not share the array one of them
    // is about to fill in.
    it('gives every recipe its own array', () => {
        const first = getDefaultModel().sampleAllocation.allocation
        const second = getDefaultModel().sampleAllocation.allocation
        expect(first).not.toBe(second)
        first.push({stratum: 1, sampleSize: 10})
        expect(second).toEqual([])
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
