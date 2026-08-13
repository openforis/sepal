import {allocationStrataMismatch, belowConfiguredMinimum, belowStatisticalMinimum} from '#sepal/recipe/samplingDesign/allocationValidation'

const model = allocation => ({
    stratification: {strata: [{value: 1}, {value: 2}]},
    sampleAllocation: {allocation}
})

describe('belowStatisticalMinimum', () => {
    it('flags rows below the hard floor of 2 (or non-integer), not valid rows', () => {
        expect(belowStatisticalMinimum([{stratum: 1, sampleSize: 2}, {stratum: 2, sampleSize: 30}])).toEqual([])
        expect(belowStatisticalMinimum([{stratum: 1, sampleSize: 1}, {stratum: 2, sampleSize: 1.5}]).map(r => r.stratum)).toEqual([1, 2])
    })
})

describe('belowConfiguredMinimum', () => {
    it('flags rows at/above the floor but below the effective configured minimum', () => {
        expect(belowConfiguredMinimum([{stratum: 1, sampleSize: 5}, {stratum: 2, sampleSize: 10}], 10).map(r => r.stratum)).toEqual([1])
    })

    it('does not double-report a row that is already below the statistical floor', () => {
        expect(belowConfiguredMinimum([{stratum: 1, sampleSize: 1}], 10)).toEqual([])
    })
})

describe('allocationStrataMismatch', () => {
    it('is null when the allocation covers the configured strata exactly', () => {
        expect(allocationStrataMismatch(model([{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}]))).toBeNull()
    })

    it('reports a missing stratum', () => {
        expect(allocationStrataMismatch(model([{stratum: 1, sampleSize: 30}]))).toMatchObject({missing: [2]})
    })

    it('reports an unexpected stratum', () => {
        expect(allocationStrataMismatch(model([{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}, {stratum: 3, sampleSize: 5}])))
            .toMatchObject({unexpected: [3]})
    })

    it('reports a duplicate stratum', () => {
        expect(allocationStrataMismatch(model([{stratum: 1, sampleSize: 30}, {stratum: 1, sampleSize: 70}, {stratum: 2, sampleSize: 5}])))
            .toMatchObject({duplicate: [1]})
    })
})
