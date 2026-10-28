import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {toAreaWeightedProportions} from '#gee/jobs/ee/samplingDesign/areaWeightedProportions'

describe('toAreaWeightedProportions', () => {
    it('weights by area, not by pixel count', () => {
        assert.deepEqual(
            toAreaWeightedProportions([{stratum: 1, weighted: 0 * 3 + 1 * 1, area: 3 + 1}]),
            [{stratum: 1, probability: 0.25}]
        )
    })

    it('agrees with the unweighted mean when pixel areas are equal', () => {
        assert.deepEqual(
            toAreaWeightedProportions([{stratum: 1, weighted: 0 * 2 + 1 * 2, area: 2 + 2}]),
            [{stratum: 1, probability: 0.5}]
        )
    })

    it('reproduces the cos(latitude) direction: equatorial pixels outweigh polar ones', () => {
        // 0.94 against 1.00 is cos(20 degrees) against the equator - the real ratio across a 10-22 degree
        // stratification, not an arbitrary pair.
        const [{probability}] = toAreaWeightedProportions([
            {stratum: 1, weighted: 0 * 1.0 + 1 * 0.94, area: 1.0 + 0.94}
        ])
        assert.ok(probability < 0.5)
        assert.ok(Math.abs(probability - 0.4845) < 10 ** -4 / 2)
    })

    it('carries every stratum through independently', () => {
        assert.deepEqual(toAreaWeightedProportions([
            {stratum: 1, weighted: 1, area: 4},
            {stratum: 7, weighted: 3, area: 4}
        ]), [
            {stratum: 1, probability: 0.25},
            {stratum: 7, probability: 0.75}
        ])
    })

    it('yields 0 rather than NaN for a stratum with no sampled area', () => {
        assert.deepEqual(
            toAreaWeightedProportions([{stratum: 1, weighted: 0, area: 0}]),
            [{stratum: 1, probability: 0}]
        )
    })

    it('tolerates an absent or empty group list', () => {
        assert.deepEqual(toAreaWeightedProportions([]), [])
        assert.deepEqual(toAreaWeightedProportions(undefined), [])
    })
})
