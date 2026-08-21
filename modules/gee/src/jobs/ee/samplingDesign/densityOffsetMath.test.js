import {
    BASE_GRID_SLACK,
    MAX_DENSITY_OFFSETS,
    minLatticeExponent,
    SQRT3,
    targetLatticeDiameter
} from '#sepal/ee/samplingDesign/systematicLatticeMath'

// The RASTER density-offset math, pinned to independently derived values. The stratified Systematic generator
// selects a nested lattice level from these numbers, so an off-by-one here silently changes how many samples a
// stratum can produce. Relative assertions cannot catch that: a bug collapsing every offset to zero keeps all
// the relationships intact. Every expectation below is computed from the documented formula, not recorded.
describe('targetLatticeDiameter', () => {
    // 0.5 * sqrt(8 * 1e10 / (3 * sqrt(3) * 10)) * 0.75
    it('is the slack-adjusted area-only estimate', () => {
        expect(targetLatticeDiameter({area: 1e10, sampleSize: 10})).toBeCloseTo(14714.1548, 4)
        expect(targetLatticeDiameter({area: 1e6, sampleSize: 100})).toBeCloseTo(46.5302, 4)
    })

    it('shrinks as the requested sample size grows, by the inverse square root', () => {
        const ten = targetLatticeDiameter({area: 1e10, sampleSize: 10})
        const forty = targetLatticeDiameter({area: 1e10, sampleSize: 40})
        expect(ten / forty).toBeCloseTo(2, 10)
    })

    it('propagates a missing area as NaN so callers clamp rather than densify', () => {
        expect(Number.isFinite(targetLatticeDiameter({sampleSize: 10}))).toBe(false)
    })

    it('holds the documented constants', () => {
        expect(BASE_GRID_SLACK).toBe(0.75)
        expect(MAX_DENSITY_OFFSETS).toBe(24)
        expect(SQRT3).toBeCloseTo(1.7320508, 7)
    })
})

// minExponent = ceil(log2(max(minDistance, 2 * scale) / sqrt(3)))
describe('minLatticeExponent (raster floor at twice the pixel size)', () => {
    it('uses the configured minimum distance when it exceeds twice the pixel size', () => {
        expect(minLatticeExponent({minDistance: 60, scale: 10})).toBe(6)
        expect(minLatticeExponent({minDistance: 5000, scale: 10})).toBe(12)
    })

    it('falls back to twice the pixel size when the configured distance is smaller', () => {
        // 2 * 10 = 20; ceil(log2(20 / sqrt(3))) = 4, not the 3 that minDistance 15 alone would give.
        expect(minLatticeExponent({minDistance: 15, scale: 10})).toBe(4)
        expect(minLatticeExponent({minDistance: 60, scale: 1000})).toBe(11)
    })

    it('uses twice the pixel size when no distance is configured', () => {
        expect(minLatticeExponent({scale: 10})).toBe(4)
        expect(minLatticeExponent({minDistance: null, scale: 10})).toBe(4)
    })

    it('grows by one for each doubling of the floor', () => {
        expect(minLatticeExponent({minDistance: 100, scale: 1})).toBe(6)
        expect(minLatticeExponent({minDistance: 200, scale: 1})).toBe(7)
        expect(minLatticeExponent({minDistance: 400, scale: 1})).toBe(8)
    })
})
