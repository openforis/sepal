import {
    crsGridArgs,
    exactLatticePoint,
    fixedOriginPhase,
    gridPixelSize,
    isAxisAlignedTransform,
    latticeCellLabel,
    latticeIdKey,
    latticeSpacing,
    minLatticeExponent,
    nestedLevel,
    parseCrsTransform,
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
        expect(layout.exponent).toBe(18)
        expect(layout.diameter).toBe(262144)
        expect(layout.dx).toBeCloseTo(454046.72689933574, 6)
        expect(layout.dy).toBe(393216)
    })

    it('reproduces the near-global 100000-sample layout', () => {
        const layout = unstratifiedLatticeLayout({area: AREA, sampleSize: 100000, minDistance: 60, nominalScale: 1})
        expect(layout.exponent).toBe(15)
        expect(layout.diameter).toBe(32768)
        expect(layout.dx).toBeCloseTo(56755.84086241697, 6)
        expect(layout.dy).toBe(49152)
    })

    it('densityOffset lowers the exponent (denser grid), clamped at the min-distance exponent', () => {
        expect(unstratifiedLatticeExponent({area: AREA, sampleSize: 1000, minDistance: 60, densityOffset: 3})).toBe(15)
        // huge offset clamps to the min-distance floor (minDistance 60 -> minExponent 6)
        expect(unstratifiedLatticeExponent({area: AREA, sampleSize: 1000, minDistance: 60, densityOffset: 99})).toBe(6)
    })

    it('scales spacing by nominalScale (the projection scale, not the sampling scale)', () => {
        expect(latticeSpacing({diameter: 262144, nominalScale: 1})).toEqual({
            distance: 262144, dx: 262144 * Math.sqrt(3), dy: 262144 * 1.5
        })
        expect(latticeSpacing({diameter: 1000, nominalScale: 2}).distance).toBe(500)
    })

    it('yields a non-finite diameter for a missing area (callers clamp)', () => {
        expect(Number.isNaN(unstratifiedLatticeDiameter({area: undefined, sampleSize: 1000, minDistance: 60}))).toBe(true)
    })
})

// The analytical unstratified contract: scale must not influence density; minDistance is the only spacing
// constraint; a missing minDistance imposes NO floor (NOT 2*scale). The raster contract is the opposite and
// is exercised separately below.
describe('analytical vs raster spacing contracts are distinct', () => {
    it('ignores scale entirely for the analytical minimum exponent', () => {
        // unstratifiedMinExponent takes no scale, and passing one changes nothing.
        expect(unstratifiedMinExponent({minDistance: 60})).toBe(6)
        expect(unstratifiedMinExponent({minDistance: 60, scale: 30})).toBe(6)
        expect(unstratifiedMinExponent({minDistance: 60, scale: 100000})).toBe(6)
    })

    it('lets a small minDistance produce a denser grid than the raster floor would allow', () => {
        // minDistance 10 with a coarse scale 30: analytical honours 10 (exponent 3); the raster path would
        // floor at 2*scale = 60 (exponent 6). Scale must not cap analytical density.
        expect(unstratifiedMinExponent({minDistance: 10})).toBe(3)
        expect(minLatticeExponent({minDistance: 10, scale: 30})).toBe(6)
    })

    it('imposes NO floor when minDistance is missing (density from area/sampleSize only, not 2*scale)', () => {
        expect(unstratifiedMinExponent({})).toBe(Number.NEGATIVE_INFINITY)
        expect(unstratifiedMinExponent({minDistance: undefined, scale: 30})).toBe(Number.NEGATIVE_INFINITY)
        // With no floor the exponent is exactly the area/sampleSize target (here the same 18 as with md=60,
        // since 60's floor of 6 never binds) - crucially it is NOT raised to the raster's 2*scale floor.
        expect(unstratifiedLatticeExponent({area: AREA, sampleSize: 1000})).toBe(18)
    })

    it('keeps the raster contract flooring at 2*scale (unchanged)', () => {
        // minDistance defaults to and is floored at 2*scale.
        expect(minLatticeExponent({minDistance: undefined, scale: 30})).toBe(6)
        expect(minLatticeExponent({minDistance: 10, scale: 30})).toBe(6)
        expect(minLatticeExponent({minDistance: 60, scale: 30})).toBe(6)
    })
})

describe('unstratifiedMaxDensityOffset', () => {
    it('uses minDistance as the analytical densification floor, not scale', () => {
        // scale 30 would floor the raster path at exponent 6; the analytical path with minDistance 10 can
        // densify to exponent 3 instead.
        expect(unstratifiedMaxDensityOffset({area: AREA, sampleSize: 1000, minDistance: 10})).toBe(15)
        expect(unstratifiedMaxDensityOffset({area: AREA, sampleSize: 1000, minDistance: 60})).toBe(12)
    })

    it('allows the bounded maximum densification when no minDistance is configured', () => {
        expect(unstratifiedMaxDensityOffset({area: AREA, sampleSize: 1000})).toBe(24)
    })

    it('returns zero when the base grid is already at the minDistance limit', () => {
        expect(unstratifiedMaxDensityOffset({area: AREA, sampleSize: 1000, minDistance: 10 ** 9})).toBe(0)
    })

    it('returns zero for invalid area/sample-size inputs', () => {
        expect(unstratifiedMaxDensityOffset({area: undefined, sampleSize: 1000, minDistance: 60})).toBe(0)
        expect(unstratifiedMaxDensityOffset({area: AREA, sampleSize: undefined, minDistance: 60})).toBe(0)
    })
})

describe('parseCrsTransform (crsTransform text/array -> 6-number array or null)', () => {
    it('parses a bracketed string, a bare string, and an array', () => {
        expect(parseCrsTransform('[30,0,0,0,-30,0]')).toEqual([30, 0, 0, 0, -30, 0])
        expect(parseCrsTransform('30, 0, 0, 0, -30, 0')).toEqual([30, 0, 0, 0, -30, 0])
        expect(parseCrsTransform([30, 0, 0, 0, -30, 0])).toEqual([30, 0, 0, 0, -30, 0])
    })

    it('returns null for empty / wrong-length / non-numeric (no transform)', () => {
        expect(parseCrsTransform('')).toBe(null)
        expect(parseCrsTransform(undefined)).toBe(null)
        expect(parseCrsTransform('30,0,0')).toBe(null)
        expect(parseCrsTransform('30,0,0,0,-30,x')).toBe(null)
        expect(parseCrsTransform([30, 0, 0, 0, -30])).toBe(null)
    })
})

describe('isAxisAlignedTransform (north-up, axis-aligned, square, non-zero)', () => {
    it('accepts a north-up square transform (a > 0, e < 0, a === -e, no shear)', () => {
        expect(isAxisAlignedTransform([30, 0, 15, 0, -30, 15])).toBe(true)
        expect(isAxisAlignedTransform([10, 0, 0, 0, -10, 0])).toBe(true)
    })

    it('rejects south-up, negative-a, shear, non-square and zero pixels', () => {
        expect(isAxisAlignedTransform([30, 0, 0, 0, 30, 0])).toBe(false) // south-up (e > 0)
        expect(isAxisAlignedTransform([-30, 0, 0, 0, -30, 0])).toBe(false) // negative x pixel (a < 0)
        expect(isAxisAlignedTransform([30, 1, 0, 0, -30, 0])).toBe(false) // shear (b != 0)
        expect(isAxisAlignedTransform([30, 0, 0, 2, -30, 0])).toBe(false) // shear (d != 0)
        expect(isAxisAlignedTransform([30, 0, 0, 0, -60, 0])).toBe(false) // non-square |a| != |e|
        expect(isAxisAlignedTransform([0, 0, 0, 0, -30, 0])).toBe(false) // zero x pixel
    })
})

describe('gridPixelSize (derived pixel size, scale XOR transform)', () => {
    it('uses the transform x-pixel when a transform is set (scale ignored)', () => {
        expect(gridPixelSize({scale: 999, crsTransform: '[30,0,15,0,-30,15]'})).toBe(30)
        expect(gridPixelSize({scale: 999, crsTransform: [45, 0, 0, 0, -45, 0]})).toBe(45)
    })

    it('uses scale when no transform', () => {
        expect(gridPixelSize({scale: 300, crsTransform: ''})).toBe(300)
        expect(gridPixelSize({scale: '30', crsTransform: undefined})).toBe(30)
    })
})

describe('crsGridArgs (reduceRegion grid: scale XOR crsTransform)', () => {
    it('sends the parsed transform and NO scale when transform-defined', () => {
        const args = crsGridArgs({crs: 'EPSG:6933', scale: 300, crsTransform: '[30,0,15,0,-30,15]'})
        expect(args).toEqual({crs: 'EPSG:6933', crsTransform: [30, 0, 15, 0, -30, 15]})
        expect('scale' in args).toBe(false)
    })

    it('sends scale and NO crsTransform when there is no transform', () => {
        const args = crsGridArgs({crs: 'EPSG:6933', scale: 300, crsTransform: ''})
        expect(args).toEqual({crs: 'EPSG:6933', scale: 300})
        expect('crsTransform' in args).toBe(false)
    })

    // The CRS default and its EE resolution belong to the shared catalog; this helper must not invent one.
    it('passes the caller-supplied crs through without inventing a default', () => {
        expect(crsGridArgs({crs: 'EPSG:6933', scale: 30}).crs).toBe('EPSG:6933')
        expect(crsGridArgs({scale: 30}).crs).toBeUndefined()
    })
})

describe('fixedOriginPhase', () => {
    it('is the zero integer coset (no geometric x/y phase)', () => {
        expect(fixedOriginPhase()).toEqual({i: 0, j: 0})
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
    it.each(cases)('level%s = %s', ([i, j], expected) => {
        expect(nestedLevel(i, j)).toBe(expected)
    })
})

describe('exactLatticePoint', () => {
    it('places an even row on the lattice node (no half-row offset)', () => {
        expect(exactLatticePoint({i: 3, j: 0, dx: 10, dy: 6})).toEqual({x: 30, y: 0})
        expect(exactLatticePoint({i: -4, j: 2, dx: 10, dy: 6})).toEqual({x: -40, y: 12})
    })

    it('offsets odd rows by dx/2, sign-safe for negative j', () => {
        expect(exactLatticePoint({i: 3, j: 1, dx: 10, dy: 6})).toEqual({x: 35, y: 6})
        expect(exactLatticePoint({i: 2, j: -1, dx: 10, dy: 6})).toEqual({x: 25, y: -6})
        expect(exactLatticePoint({i: -3, j: -11, dx: 10, dy: 6})).toEqual({x: -25, y: -66})
    })

    it('applies the origin-phase offset', () => {
        expect(exactLatticePoint({i: 1, j: 0, dx: 10, dy: 6, offsetX: 2, offsetY: 3})).toEqual({x: 12, y: 3})
    })

    it('depends only on global i, j (not on any AOI)', () => {
        const a = exactLatticePoint({i: 5, j: 7, dx: 10, dy: 6})
        const b = exactLatticePoint({i: 5, j: 7, dx: 10, dy: 6})
        expect(a).toEqual(b)
    })
})

describe('latticeIdKey (collision-safe, sign-safe, AOI-independent)', () => {
    it('handles negative indices', () => {
        expect(latticeIdKey(-3, -4)).toBe('-3:-4')
        expect(latticeIdKey(0, -1)).toBe('0:-1')
    })

    it('does not collide on a mixed-sign edge case', () => {
        expect(latticeIdKey(0, -1)).not.toBe(latticeIdKey(-1, 99999))
    })

    it('is stable for the same index across calls', () => {
        expect(latticeIdKey(42, -7)).toBe(latticeIdKey(42, -7))
    })
})

describe('latticeCellLabel (int64 i*2^32+j; the pre-vectorization numeric label)', () => {
    it('packs high/low 32 bits for representative cells', () => {
        expect(latticeCellLabel(0, 0)).toBe('0')
        expect(latticeCellLabel(0, 1)).toBe('1')
        expect(latticeCellLabel(1, 0)).toBe('4294967296') // 2^32
        expect(latticeCellLabel(2, 3)).toBe('8589934595') // 2*2^32 + 3
    })

    it('handles negative indices', () => {
        expect(latticeCellLabel(0, -1)).toBe('-1')
        expect(latticeCellLabel(-1, 0)).toBe('-4294967296') // -2^32
        expect(latticeCellLabel(-3, -4)).toBe('-12884901892') // -3*2^32 - 4
    })

    it('does not collide on a mixed-sign edge case', () => {
        expect(latticeCellLabel(0, -1)).not.toBe(latticeCellLabel(-1, 99999))
    })

    it('is injective across a mixed-sign, large-magnitude grid (no collisions)', () => {
        const vals = [-1000000, -99999, -2, -1, 0, 1, 2, 99999, 1000000]
        const labels = new Set()
        for (const i of vals) {
            for (const j of vals) {
                labels.add(latticeCellLabel(i, j))
            }
        }
        expect(labels.size).toBe(vals.length * vals.length)
    })

    it('stays exact beyond 2^53 (returned as a string, not a lossy Number)', () => {
        // 3000000 * 2^32 + 1 = 12884901888000001 > Number.MAX_SAFE_INTEGER, so the naive Number path drops
        // the +1 (12884901888000000) and would let (3000000,1) collide with (3000000,0). The string does not.
        expect(latticeCellLabel(3000000, 1)).toBe('12884901888000001')
        expect(latticeCellLabel(3000000, 1)).not.toBe(String(3000000 * 2 ** 32 + 1))
        expect(latticeCellLabel(3000000, 1)).not.toBe(latticeCellLabel(3000000, 0))
    })
})
