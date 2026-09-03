// Unit tests for the busy verdict — the POSITIVE predicate that extends deadlines.
//
// The numbers here are the ones measured on the test server (2026-08-13), because the whole point
// of thresholding absolute quantities is that the old percent-of-instance thresholds failed
// against exactly these figures.

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
        expect(coresUsed(50, 2)).toBe(1)
        expect(coresUsed(1.5625, 64)).toBe(1)
    })

    test('is null without a measurement or a core count', () => {
        expect(coresUsed(null, 8)).toBeNull()
        expect(coresUsed(50, 0)).toBeNull()
    })
})

describe('the failures percent-of-instance thresholds produced', () => {
    // A real one-core job reads as 1.6 % on a 64-core instance — below the old 5 % threshold, so
    // its session would have been killed while it was computing.
    test('one core of real work is busy on ANY instance size', () => {
        expect(verdict({cpuAvg: 50}, small).busy).toBe(true)
        expect(verdict({cpuAvg: 1.5625}, large).busy).toBe(true)
    })

    // Three idle app tabs measured 1.48 % on a T3aSmall — 30 % of the old 5 % threshold, and
    // scaling ~0.44 % per app, so about ten idle tabs would have pinned the session busy forever.
    test('idle app tabs are not busy, however many are open', () => {
        expect(verdict({cpuAvg: 1.48}, small).busy).toBe(false)
        expect(verdict({cpuAvg: 1.48 * 4}, small).busy).toBe(false) // ~12 idle tabs
    })

    // The measured idle floor is 14.7 KB/s for three apps, ~4.9 KB/s per app. The old 50 KB/s
    // threshold left a 3.4x margin; real transfers run at MB/s.
    test('polling traffic is not busy, but a real transfer is', () => {
        expect(verdict({netAvg: 14.7 * 1024}).busy).toBe(false)
        expect(verdict({netAvg: 100 * 1024}).busy).toBe(false)
        expect(verdict({netAvg: 2 * 1024 * 1024}).busy).toBe(true)
    })
})

describe('GPU', () => {
    test('a saturated GPU counts, on GPU instance types', () => {
        // One saturated device of eight reads 12.5 % as a device mean.
        expect(verdict({gpuAvg: 12.5}, gpuType).busy).toBe(true)
    })

    test('is ignored on non-GPU types', () => {
        expect(verdict({gpuAvg: 99}, small).busy).toBe(false)
    })

    test('needs its own coverage', () => {
        expect(isBusy({
            stats: stats({gpuAvg: 99, gpuSamples: 1}), instanceType: gpuType, policy, requiredSamples: 6
        }).busy).toBe(false)
    })
})

describe('RAM', () => {
    // RAM is a level, not a rate: a finished process that has not exited holds its heap
    // indefinitely, so a RAM threshold would keep dead sessions alive — the exact failure the
    // positive predicate exists to avoid.
    test('is not part of the verdict at all', () => {
        expect(verdict({ramPct: 99, ramBytes: 1e12}).busy).toBe(false)
    })
})

describe('coverage', () => {
    // Coverage below the floor is NOT a verdict — the caller treats it as busy for a bounded
    // number of ticks, because under a deadline missing data would otherwise close a computing
    // instance.
    test('below the floor reports no coverage rather than "not busy"', () => {
        expect(verdict({samples: 2})).toEqual({busy: false, coverage: false})
    })

    test('no stats at all is the same case', () => {
        expect(isBusy({stats: undefined, instanceType: small, policy, requiredSamples: 6}))
            .toEqual({busy: false, coverage: false})
    })

    test('a quiet, well-sampled session is a real "not busy" verdict', () => {
        expect(verdict({})).toEqual({busy: false, coverage: true})
    })
})

describe('requiredSamplesFor', () => {
    test('is 80 % of the effectively visible samples', () => {
        // 10 minutes at 60 s = 10 expected, minus the 2 structurally invisible edge samples.
        expect(requiredSamplesFor(10, 60)).toBeCloseTo(6.4)
    })

    test('never demands fewer than 0.8 of one sample', () => {
        expect(requiredSamplesFor(1, 60)).toBeCloseTo(0.8)
    })
})
