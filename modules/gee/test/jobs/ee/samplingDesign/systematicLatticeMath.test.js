import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {
    exactLatticePoint,
    fixedOriginPhase,
    gridPixelSize,
    latticeCellLabel,
    latticeIdKey,
    latticeSpacing,
    minLatticeExponent,
    nestedLevel,
    unstratifiedLatticeDiameter,
    unstratifiedLatticeExponent,
    unstratifiedLatticeLayout,
    unstratifiedMaxDensityOffset,
    unstratifiedMinExponent
} from '#sepal/ee/samplingDesign/systematicLatticeMath'

// Near-global equal-area reference area.
const AREA = 499525934079679

describe('unstratifiedLatticeLayout / diameter / spacing (analytical, minDistance-only)', () => {
    it('reproduces the near-global 1000-sample layout', () => {
        const layout = unstratifiedLatticeLayout({area: AREA, sampleSize: 1000, minDistance: 60, nominalScale: 1})
        assert.equal(layout.exponent, 18)
        assert.equal(layout.diameter, 262144)
        assert.ok(Math.abs(layout.dx - 454046.72689933574) < 10 ** -6 / 2)
        assert.equal(layout.dy, 393216)
    })

    it('reproduces the near-global 100000-sample layout', () => {
        const layout = unstratifiedLatticeLayout({area: AREA, sampleSize: 100000, minDistance: 60, nominalScale: 1})
        assert.equal(layout.exponent, 15)
        assert.equal(layout.diameter, 32768)
        assert.ok(Math.abs(layout.dx - 56755.84086241697) < 10 ** -6 / 2)
        assert.equal(layout.dy, 49152)
    })

    it('densityOffset lowers the exponent (denser grid), clamped at the min-distance exponent', () => {
        assert.equal(
            unstratifiedLatticeExponent({area: AREA, sampleSize: 1000, minDistance: 60, densityOffset: 3}),
            15
        )
        // huge offset clamps to the min-distance floor (minDistance 60 -> minExponent 6)
        assert.equal(
            unstratifiedLatticeExponent({area: AREA, sampleSize: 1000, minDistance: 60, densityOffset: 99}),
            6
        )
    })

    it('scales spacing by nominalScale (the projection scale, not the sampling scale)', () => {
        assert.deepEqual(latticeSpacing({diameter: 262144, nominalScale: 1}), {
            distance: 262144, dx: 262144 * Math.sqrt(3), dy: 262144 * 1.5
        })
        assert.equal(latticeSpacing({diameter: 1000, nominalScale: 2}).distance, 500)
    })

    it('yields a non-finite diameter for a missing area (callers clamp)', () => {
        assert.equal(
            Number.isNaN(unstratifiedLatticeDiameter({area: undefined, sampleSize: 1000, minDistance: 60})),
            true
        )
    })
})

// The analytical unstratified contract: scale must not influence density; minDistance is the only spacing
// constraint; a missing minDistance imposes NO floor (NOT 2*scale). The raster contract is the opposite and
// is exercised separately below.
describe('analytical vs raster spacing contracts are distinct', () => {
    it('ignores scale entirely for the analytical minimum exponent', () => {
        // unstratifiedMinExponent takes no scale, and passing one changes nothing.
        assert.equal(unstratifiedMinExponent({minDistance: 60}), 6)
        assert.equal(unstratifiedMinExponent({minDistance: 60, scale: 30}), 6)
        assert.equal(unstratifiedMinExponent({minDistance: 60, scale: 100000}), 6)
    })

    it('lets a small minDistance produce a denser grid than the raster floor would allow', () => {
        // minDistance 10 with a coarse scale 30: analytical honours 10 (exponent 3); the raster path would
        // floor at 2*scale = 60 (exponent 6). Scale must not cap analytical density.
        assert.equal(unstratifiedMinExponent({minDistance: 10}), 3)
        assert.equal(minLatticeExponent({minDistance: 10, scale: 30}), 6)
    })

    it('imposes NO floor when minDistance is missing (density from area/sampleSize only, not 2*scale)', () => {
        assert.equal(unstratifiedMinExponent({}), Number.NEGATIVE_INFINITY)
        assert.equal(
            unstratifiedMinExponent({minDistance: undefined, scale: 30}),
            Number.NEGATIVE_INFINITY
        )
        // With no floor the exponent is exactly the area/sampleSize target (here the same 18 as with md=60,
        // since 60's floor of 6 never binds) - crucially it is NOT raised to the raster's 2*scale floor.
        assert.equal(unstratifiedLatticeExponent({area: AREA, sampleSize: 1000}), 18)
    })

    it('keeps the raster contract flooring at 2*scale (unchanged)', () => {
        // minDistance defaults to and is floored at 2*scale.
        assert.equal(minLatticeExponent({minDistance: undefined, scale: 30}), 6)
        assert.equal(minLatticeExponent({minDistance: 10, scale: 30}), 6)
        assert.equal(minLatticeExponent({minDistance: 60, scale: 30}), 6)
    })
})

describe('unstratifiedMaxDensityOffset', () => {
    it('uses minDistance as the analytical densification floor, not scale', () => {
        // scale 30 would floor the raster path at exponent 6; the analytical path with minDistance 10 can
        // densify to exponent 3 instead.
        assert.equal(
            unstratifiedMaxDensityOffset({area: AREA, sampleSize: 1000, minDistance: 10}),
            15
        )
        assert.equal(
            unstratifiedMaxDensityOffset({area: AREA, sampleSize: 1000, minDistance: 60}),
            12
        )
    })

    it('allows the bounded maximum densification when no minDistance is configured', () => {
        assert.equal(unstratifiedMaxDensityOffset({area: AREA, sampleSize: 1000}), 24)
    })

    it('returns zero when the base grid is already at the minDistance limit', () => {
        assert.equal(
            unstratifiedMaxDensityOffset({area: AREA, sampleSize: 1000, minDistance: 10 ** 9}),
            0
        )
    })

    it('returns zero for invalid area/sample-size inputs', () => {
        assert.equal(
            unstratifiedMaxDensityOffset({area: undefined, sampleSize: 1000, minDistance: 60}),
            0
        )
        assert.equal(
            unstratifiedMaxDensityOffset({area: AREA, sampleSize: undefined, minDistance: 60}),
            0
        )
    })
})

describe('gridPixelSize (the grid metre Scale)', () => {
    it('is the configured Scale, in metres', () => {
        assert.equal(gridPixelSize({scale: 300}), 300)
        assert.equal(gridPixelSize({scale: '30'}), 30)
    })

    it('is not a number when no Scale is configured', () => {
        assert.equal(Number.isFinite(gridPixelSize({})), false)
    })
})

describe('fixedOriginPhase', () => {
    it('is the zero integer coset (no geometric x/y phase)', () => {
        assert.deepEqual(fixedOriginPhase(), {i: 0, j: 0})
    })
})

describe('nestedLevel (verified against the live EE band)', () => {
    // {[i,j]: level} confirmed equal to the EE level image for these cells (incl. negatives).
    const cases = [
        [[0, 0], 4.5], [[1, 0], 0.5], [[0, 1], 0], [[1, 1], 0], [[2, 2], 0.5],
        [[3, 4], 0.5], [[4, 8], 3], [[7, 12], 0.5], [[16, 32], 4.5],
        [[-1, 0], 0.5], [[0, -1], 0], [[-1, -1], 0], [[-2, -3], 0], [[-3, -4], 0.5],
        [[5, -11], 0], [[-8, -11], 0], [[-16, -32], 4.5]
    ]
    for (const [[i, j], expected] of cases) {
        it(`level${i},${j} = ${expected}`, () => {
            assert.equal(nestedLevel(i, j), expected)
        })
    }
})

describe('exactLatticePoint', () => {
    it('places an even row on the lattice node (no half-row offset)', () => {
        assert.deepEqual(exactLatticePoint({i: 3, j: 0, dx: 10, dy: 6}), {x: 30, y: 0})
        assert.deepEqual(exactLatticePoint({i: -4, j: 2, dx: 10, dy: 6}), {x: -40, y: 12})
    })

    it('offsets odd rows by dx/2, sign-safe for negative j', () => {
        assert.deepEqual(exactLatticePoint({i: 3, j: 1, dx: 10, dy: 6}), {x: 35, y: 6})
        assert.deepEqual(exactLatticePoint({i: 2, j: -1, dx: 10, dy: 6}), {x: 25, y: -6})
        assert.deepEqual(exactLatticePoint({i: -3, j: -11, dx: 10, dy: 6}), {x: -25, y: -66})
    })

    it('applies the origin-phase offset', () => {
        assert.deepEqual(
            exactLatticePoint({i: 1, j: 0, dx: 10, dy: 6, offsetX: 2, offsetY: 3}),
            {x: 12, y: 3}
        )
    })

    it('depends only on global i, j (not on any AOI)', () => {
        const a = exactLatticePoint({i: 5, j: 7, dx: 10, dy: 6})
        const b = exactLatticePoint({i: 5, j: 7, dx: 10, dy: 6})
        assert.deepEqual(a, b)
    })
})

describe('latticeIdKey (collision-safe, sign-safe, AOI-independent)', () => {
    it('handles negative indices', () => {
        assert.equal(latticeIdKey(-3, -4), '-3:-4')
        assert.equal(latticeIdKey(0, -1), '0:-1')
    })

    it('does not collide on a mixed-sign edge case', () => {
        assert.notEqual(latticeIdKey(0, -1), latticeIdKey(-1, 99999))
    })

    it('is stable for the same index across calls', () => {
        assert.equal(latticeIdKey(42, -7), latticeIdKey(42, -7))
    })
})

describe('latticeCellLabel (int64 i*2^32+j; the pre-vectorization numeric label)', () => {
    it('packs high/low 32 bits for representative cells', () => {
        assert.equal(latticeCellLabel(0, 0), '0')
        assert.equal(latticeCellLabel(0, 1), '1')
        assert.equal(latticeCellLabel(1, 0), '4294967296') // 2^32
        assert.equal(latticeCellLabel(2, 3), '8589934595') // 2*2^32 + 3
    })

    it('handles negative indices', () => {
        assert.equal(latticeCellLabel(0, -1), '-1')
        assert.equal(latticeCellLabel(-1, 0), '-4294967296') // -2^32
        assert.equal(latticeCellLabel(-3, -4), '-12884901892') // -3*2^32 - 4
    })

    it('does not collide on a mixed-sign edge case', () => {
        assert.notEqual(latticeCellLabel(0, -1), latticeCellLabel(-1, 99999))
    })

    it('is injective across a mixed-sign, large-magnitude grid (no collisions)', () => {
        const vals = [-1000000, -99999, -2, -1, 0, 1, 2, 99999, 1000000]
        const labels = new Set()
        for (const i of vals) {
            for (const j of vals) {
                labels.add(latticeCellLabel(i, j))
            }
        }
        assert.equal(labels.size, vals.length * vals.length)
    })

    it('stays exact beyond 2^53 (returned as a string, not a lossy Number)', () => {
        // 3000000 * 2^32 + 1 = 12884901888000001 > Number.MAX_SAFE_INTEGER, so the naive Number path drops
        // the +1 (12884901888000000) and would let (3000000,1) collide with (3000000,0). The string does not.
        assert.equal(latticeCellLabel(3000000, 1), '12884901888000001')
        assert.notEqual(latticeCellLabel(3000000, 1), String(3000000 * 2 ** 32 + 1))
        assert.notEqual(latticeCellLabel(3000000, 1), latticeCellLabel(3000000, 0))
    })
})
