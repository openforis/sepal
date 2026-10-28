// Unit tests for the busy verdict — the POSITIVE predicate that extends deadlines.
//
// The numbers here are the ones measured on the test server (2026-08-13), because the whole point
// of thresholding absolute quantities is that the old percent-of-instance thresholds failed
// against exactly these figures.

import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {coresUsed, isBusy, requiredSamplesFor} from './busyVerdict.js'

const policy = {
    busyCpuCores: 0.5,
    busyGpuThresholdPct: 5,
    busyNetworkThresholdKBps: 500,
}

const small = {cpuCount: 2, gpuCount: 0}
const large = {cpuCount: 64, gpuCount: 0}
const gpuType = {cpuCount: 8, gpuCount: 8}

const stats = (overrides = {}) => ({
    samples: 10,
    cpuAvg: 0,
    gpuSamples: 10,
    gpuAvg: null,
    netAvg: 0,
    ...overrides,
})

const verdict = (statsOverrides, instanceType = small) =>
    isBusy({stats: stats(statsOverrides), instanceType, policy, requiredSamples: 6})

describe('coresUsed', () => {
    // cpu_pct is stored as coresUsed / instance_cores × 100, so the absolute quantity is
    // recovered rather than re-measured.
    test('recovers the absolute quantity from the stored percentage', () => {
        assert.equal(coresUsed(50, 2), 1)
        assert.equal(coresUsed(1.5625, 64), 1)
    })

    test('is null without a measurement or a core count', () => {
        assert.equal(coresUsed(null, 8), null)
        assert.equal(coresUsed(50, 0), null)
    })
})

describe('the failures percent-of-instance thresholds produced', () => {
    // A real one-core job reads as 1.6 % on a 64-core instance — below the old 5 % threshold, so
    // its session would have been killed while it was computing.
    test('one core of real work is busy on ANY instance size', () => {
        assert.equal(verdict({cpuAvg: 50}, small).busy, true)
        assert.equal(verdict({cpuAvg: 1.5625}, large).busy, true)
    })

    // Three idle app tabs measured 1.48 % on a T3aSmall — 30 % of the old 5 % threshold, and
    // scaling ~0.44 % per app, so about ten idle tabs would have pinned the session busy forever.
    test('idle app tabs are not busy, however many are open', () => {
        assert.equal(verdict({cpuAvg: 1.48}, small).busy, false)
        assert.equal(verdict({cpuAvg: 1.48 * 4}, small).busy, false) // ~12 idle tabs
    })

    // The measured idle floor is 14.7 KB/s for three apps, ~4.9 KB/s per app. The old 50 KB/s
    // threshold left a 3.4x margin; real transfers run at MB/s.
    test('polling traffic is not busy, but a real transfer is', () => {
        assert.equal(verdict({netAvg: 14.7 * 1024}).busy, false)
        assert.equal(verdict({netAvg: 100 * 1024}).busy, false)
        assert.equal(verdict({netAvg: 2 * 1024 * 1024}).busy, true)
    })
})

describe('GPU', () => {
    test('a saturated GPU counts, on GPU instance types', () => {
        // One saturated device of eight reads 12.5 % as a device mean.
        assert.equal(verdict({gpuAvg: 12.5}, gpuType).busy, true)
    })

    test('is ignored on non-GPU types', () => {
        assert.equal(verdict({gpuAvg: 99}, small).busy, false)
    })

    test('needs its own coverage', () => {
        assert.equal(isBusy({
            stats: stats({gpuAvg: 99, gpuSamples: 1}), instanceType: gpuType, policy, requiredSamples: 6
        }).busy, false)
    })
})

describe('RAM', () => {
    // RAM is a level, not a rate: a finished process that has not exited holds its heap
    // indefinitely, so a RAM threshold would keep dead sessions alive — the exact failure the
    // positive predicate exists to avoid.
    test('is not part of the verdict at all', () => {
        assert.equal(verdict({ramPct: 99, ramBytes: 1e12}).busy, false)
    })
})

describe('coverage', () => {
    // Coverage below the floor is NOT a verdict — the caller treats it as busy for a bounded
    // number of ticks, because under a deadline missing data would otherwise close a computing
    // instance.
    test('below the floor reports no coverage rather than "not busy"', () => {
        assert.deepEqual(verdict({samples: 2}), {busy: false, coverage: false})
    })

    test('no stats at all is the same case', () => {
        assert.deepEqual(
            isBusy({stats: undefined, instanceType: small, policy, requiredSamples: 6}),
            {busy: false, coverage: false}
        )
    })

    test('a quiet, well-sampled session is a real "not busy" verdict', () => {
        assert.deepEqual(verdict({}), {busy: false, coverage: true})
    })
})

describe('requiredSamplesFor', () => {
    test('is 80 % of the effectively visible samples', () => {
        // 10 minutes at 60 s = 10 expected, minus the 2 structurally invisible edge samples.
        assert.ok(Math.abs(requiredSamplesFor(10, 60) - 6.4) < 10 ** -2 / 2)
    })

    test('never demands fewer than 0.8 of one sample', () => {
        assert.ok(Math.abs(requiredSamplesFor(1, 60) - 0.8) < 10 ** -2 / 2)
    })
})
