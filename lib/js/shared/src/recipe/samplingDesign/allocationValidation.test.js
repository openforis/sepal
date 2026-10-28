import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {allocationStrataMismatch, belowConfiguredMinimum, belowStatisticalMinimum} from '#sepal/recipe/samplingDesign/allocationValidation'
import {assertMatches} from '#sepal/testSupport/assert'

const model = allocation => ({
    stratification: {strata: [{value: 1}, {value: 2}]},
    sampleAllocation: {allocation}
})

describe('belowStatisticalMinimum', () => {
    it('flags rows below the hard floor of 2 (or non-integer), not valid rows', () => {
        assert.deepEqual(
            belowStatisticalMinimum([{stratum: 1, sampleSize: 2}, {stratum: 2, sampleSize: 30}]),
            []
        )
        assert.deepEqual(
            belowStatisticalMinimum([{stratum: 1, sampleSize: 1}, {stratum: 2, sampleSize: 1.5}]).map(r => r.stratum),
            [1, 2]
        )
    })
})

describe('belowConfiguredMinimum', () => {
    it('flags rows at/above the floor but below the effective configured minimum', () => {
        assert.deepEqual(
            belowConfiguredMinimum([{stratum: 1, sampleSize: 5}, {stratum: 2, sampleSize: 10}], 10).map(r => r.stratum),
            [1]
        )
    })

    it('does not double-report a row that is already below the statistical floor', () => {
        assert.deepEqual(belowConfiguredMinimum([{stratum: 1, sampleSize: 1}], 10), [])
    })
})

describe('allocationStrataMismatch', () => {
    it('is null when the allocation covers the configured strata exactly', () => {
        assert.equal(
            allocationStrataMismatch(model([{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}])),
            null
        )
    })

    it('reports a missing stratum', () => {
        assertMatches(
            allocationStrataMismatch(model([{stratum: 1, sampleSize: 30}])),
            {missing: [2]}
        )
    })

    it('reports an unexpected stratum', () => {
        assertMatches(
            allocationStrataMismatch(model([{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}, {stratum: 3, sampleSize: 5}])),
            {unexpected: [3]}
        )
    })

    it('reports a duplicate stratum', () => {
        assertMatches(
            allocationStrataMismatch(model([{stratum: 1, sampleSize: 30}, {stratum: 1, sampleSize: 70}, {stratum: 2, sampleSize: 5}])),
            {duplicate: [1]}
        )
    })
})
