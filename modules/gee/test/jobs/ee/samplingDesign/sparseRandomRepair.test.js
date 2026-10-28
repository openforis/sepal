import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {initialThresholds, MAX_REPAIR_ROUNDS, repairStep} from '#sepal/ee/samplingDesign/sparseRandomRepair'

// Pure threshold + repair rules. Thresholds are a runtime knob only; these tests pin the two behaviours a wrong
// implementation would get wrong: the small-request floor / saturation, and the monotonic repair that always
// reaches threshold 1 before declaring a shortfall.
describe('initialThresholds', () => {
    const at = ({area, sampleSize, scale = 10, multiplier = 2}) =>
        initialThresholds({allocation: [{stratum: 1, area, sampleSize}], scale, multiplier})[0]

    it('applies the max(2*n, 10) floor for small requests', () => {
        // eligible cells = area/scale^2 = 1e6/100 = 1e4; expected candidates = 10 (floor), so threshold = 10/1e4
        assert.ok(Math.abs(at({area: 1e6, sampleSize: 2}) - 10 / 1e4) < 10 ** -12 / 2)
    })

    it('uses 2*n when it exceeds the floor', () => {
        // n=50 -> target 100 -> threshold 100/1e4
        assert.ok(Math.abs(at({area: 1e6, sampleSize: 50}) - 100 / 1e4) < 10 ** -12 / 2)
    })

    it('saturates at 1 when the target exceeds the frame', () => {
        // eligible cells = 1/100 -> clamped to >=1; target 20 -> min(1, 20)
        assert.equal(at({area: 1, sampleSize: 10}), 1)
    })
})

describe('repairStep', () => {
    const allocation = [{stratum: 1, sampleSize: 10}, {stratum: 2, sampleSize: 10}]

    it('is done when every stratum has at least its requested count', () => {
        assert.deepEqual(
            repairStep({thresholds: [0.2, 0.2], counts: {1: 10, 2: 12}, allocation}),
            {done: true}
        )
    })

    it('repairs only the deficient strata, widening their threshold by doubling', () => {
        const step = repairStep({thresholds: [0.2, 0.2], counts: {1: 4, 2: 10}, allocation})
        assert.equal(step.repair, true)
        assert.deepEqual(step.nextThresholds, [0.4, 0.2]) // only stratum 1 widened
        // the disjoint interval for stratum 1 is [0.2, 0.4); stratum 2 gets an empty interval [0.2, 0.2)
        assert.deepEqual(step.loThresholds, [0.2, 0.2])
        assert.deepEqual(step.hiThresholds, [0.4, 0.2])
        assert.deepEqual(step.widenedStrata, [1])
    })

    it('clamps a widening threshold to 1, never above', () => {
        assert.deepEqual(
            repairStep({thresholds: [0.6, 0.2], counts: {1: 4, 2: 10}, allocation}).nextThresholds,
            [1, 0.2]
        )
    })

    it('does not report underproduction while a deficient stratum can still widen toward 1', () => {
        assert.equal(
            repairStep({thresholds: [0.9, 0.2], counts: {1: 4, 2: 10}, allocation}).repair,
            true
        )
    })

    it('reports underproduction only once a deficient stratum is already at threshold 1', () => {
        assert.deepEqual(
            repairStep({thresholds: [1, 0.2], counts: {1: 4, 2: 10}, allocation}),
            {underproduction: true}
        )
    })

    it('reports a distinct repair-limit failure when the round budget is exhausted below threshold 1', () => {
        assert.deepEqual(
            repairStep({thresholds: [0.5, 0.5], counts: {1: 4, 2: 4}, allocation, round: MAX_REPAIR_ROUNDS}),
            {repairLimit: true}
        )
    })
})
