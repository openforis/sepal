import {selectAllocationView, selectProportionView, selectStrataView} from './selectors'

// Clean Sampling Design model fixture: two strata, areas 300/700 (weights .3/.7).
const model = {
    stratification: {
        legendByStratum: {
            1: {label: 'Forest', color: '#0a0'},
            2: {label: 'Non-forest', color: '#a00'}
        }
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
    samplingDesignDerived: {
        areaByStratum: {1: 300, 2: 700},
        probabilityByStratum: {1: 0.6, 2: 0.1}
    }
}

const withDerived = areaPerStratum => ({...model, samplingDesignDerived: areaPerStratum})

describe('selectStrataView', () => {
    it('joins areas with legend and derives weights', () => {
        expect(selectStrataView(model)).toEqual([
            {stratum: 1, area: 300, weight: 0.3, label: 'Forest', color: '#0a0'},
            {stratum: 2, area: 700, weight: 0.7, label: 'Non-forest', color: '#a00'}
        ])
    })

    it('returns null before areas are computed', () => {
        expect(selectStrataView(withDerived({}))).toBe(null)
    })

    it('prefers cached weights when present', () => {
        const cached = withDerived({areaByStratum: {1: 300, 2: 700}, weightByStratum: {1: 0.25, 2: 0.75}})
        expect(selectStrataView(cached).map(({weight}) => weight)).toEqual([0.25, 0.75])
    })

    it('defaults missing legend entries to String(stratum) and #000000', () => {
        const sparse = {...model, stratification: {legendByStratum: {1: {label: 'Forest', color: '#0a0'}}}}
        expect(selectStrataView(sparse)[1]).toMatchObject({stratum: 2, label: '2', color: '#000000'})
    })
})

describe('selectProportionView', () => {
    it('derives proportions from probabilities scaled to the anticipated overall proportion', () => {
        // overall probability = .3*.6 + .7*.1 = .25; factor = .2/.25 = .8
        expect(selectProportionView(model).map(({proportion}) => proportion)).toEqual([0.48, 0.08])
    })

    it('uses manual proportions in manual mode', () => {
        const manual = {...model, proportions: {manual: true, manualProportionByStratum: {1: 0.5, 2: 0.2}}}
        expect(selectProportionView(manual).map(({proportion}) => proportion)).toEqual([0.5, 0.2])
    })

    it('returns null before probabilities are computed (non-manual)', () => {
        expect(selectProportionView(withDerived({areaByStratum: {1: 300, 2: 700}}))).toBe(null)
    })
})

describe('selectAllocationView', () => {
    it('allocates a fixed sample size by strategy', () => {
        expect(selectAllocationView(model).map(({stratum, sampleSize}) => ({stratum, sampleSize}))).toEqual([
            {stratum: 1, sampleSize: 30},
            {stratum: 2, sampleSize: 70}
        ])
    })

    it('uses manual sample sizes in manual mode', () => {
        const manual = {...model, sampleAllocation: {manual: true, manualSampleSizeByStratum: {1: 12, 2: 8}}}
        expect(selectAllocationView(manual).map(({sampleSize}) => sampleSize)).toEqual([12, 8])
    })

    it('estimates a finite, positive allocation in estimate mode', () => {
        const estimate = {...model, sampleAllocation: {...model.sampleAllocation, estimateSampleSize: true}}
        expect(selectAllocationView(estimate).every(({sampleSize}) => Number.isFinite(sampleSize) && sampleSize > 0)).toBe(true)
    })
})

describe('selectAllocationView - proportions skipped', () => {
    // No proportions panel: areas present, no probabilityByStratum, fixed sample size.
    const skippedModel = {
        stratification: {legendByStratum: {1: {label: 'Forest', color: '#0a0'}, 2: {label: 'Non-forest', color: '#a00'}}},
        proportions: {skip: true},
        sampleAllocation: {manual: false, estimateSampleSize: false, sampleSize: 100, minSamplesPerStratum: 1},
        samplingDesignDerived: {areaByStratum: {1: 300, 2: 700}}
    }
    const withStrategy = allocationStrategy => ({
        ...skippedModel,
        sampleAllocation: {...skippedModel.sampleAllocation, allocationStrategy}
    })

    it('allocates PROPORTIONAL from area-derived weights without proportions', () => {
        expect(selectAllocationView(withStrategy('PROPORTIONAL')).map(({stratum, sampleSize}) => ({stratum, sampleSize}))).toEqual([
            {stratum: 1, sampleSize: 30},
            {stratum: 2, sampleSize: 70}
        ])
    })

    it('allocates EQUAL without proportions', () => {
        expect(selectAllocationView(withStrategy('EQUAL')).map(({sampleSize}) => sampleSize)).toEqual([50, 50])
    })

    it('rejects OPTIMAL/POWER when proportions are skipped (NaN sizes)', () => {
        expect(selectAllocationView(withStrategy('OPTIMAL')).every(({sampleSize}) => Number.isNaN(sampleSize))).toBe(true)
        expect(selectAllocationView(withStrategy('POWER')).every(({sampleSize}) => Number.isNaN(sampleSize))).toBe(true)
    })

    it('rejects sample-size estimation when proportions are skipped (NaN sizes)', () => {
        const estimate = {...withStrategy('PROPORTIONAL'), sampleAllocation: {
            ...withStrategy('PROPORTIONAL').sampleAllocation, estimateSampleSize: true, marginOfError: 50, confidenceLevel: 95, relativeMarginOfError: true
        }}
        expect(selectAllocationView(estimate).every(({sampleSize}) => Number.isNaN(sampleSize))).toBe(true)
    })

    it('honors manual sample sizes even when proportions are skipped', () => {
        const manual = {...skippedModel, sampleAllocation: {manual: true, manualSampleSizeByStratum: {1: 12, 2: 8}}}
        expect(selectAllocationView(manual).map(({sampleSize}) => sampleSize)).toEqual([12, 8])
    })
})
