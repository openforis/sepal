// Pure, EE-free lattice math for systematic Sampling Design. These are the canonical, unit-tested formulas
// shared by the raster path (stratifiedSystematicSampleImage), the density/max-offset decision
// (systematicStratumMaxOffset) and the optimized unstratified index-candidate path. Keeping them here avoids
// duplicating subtly different copies of the same math. Values were cross-checked against the live EE
// implementation (see the slice report's smoke script) so a JS port can't silently drift from EE semantics.
//
// Two DISTINCT spacing contracts live here, kept separate on purpose (see the sections below):
//   - RASTER / max-offset contract: the minimum spacing is floored at 2*scale, because the raster generator
//     cannot resolve two samples closer than ~2 pixels. `scale` is a hard density limit there.
//   - ANALYTICAL UNSTRATIFIED contract: spacing is constrained ONLY by the requested minDistance. `scale` must
//     NOT influence point precision, runtime, or allowed density - the analytical path emits exact points, so
//     the raster's pixel-resolution limit does not apply.

export const SQRT3 = Math.sqrt(3)

// Shrink the area-only target diameter so the base grid (densityOffset=0) is intentionally a bit denser than
// the optimistic area estimate. See stratifiedSystematicSampleImage for the full rationale.
export const BASE_GRID_SLACK = 0.75

// Root period exponent (meters, power of two) for the seeded lattice phase; every generated diameter divides
// it, so seeded phases stay compatible across densities. Mirrors systematicSampling.js.
export const ROOT_DIAMETER_EXPONENT = 32

// Densest offset any stratum may densify to before the min-distance clamp makes it a no-op.
export const MAX_DENSITY_OFFSETS = 24

// Area-only target diameter, slack-adjusted. `stratum` carries a client-side {area, sampleSize}. Non-finite
// (e.g. missing area) propagates as NaN so callers can clamp.
export const targetLatticeDiameter = ({area, sampleSize}) =>
    0.5 * Math.sqrt(8 * Number(area) / (3 * SQRT3 * Number(sampleSize))) * BASE_GRID_SLACK

// Cell spacing in the sampling projection's grid units. `nominalScale` is the projection's nominal scale
// (1 for EPSG:3410), NOT the sampling `scale`. dx is the nearest-neighbour row spacing (sqrt(3)*distance),
// dy the row height (1.5*distance). Mirrors createHexSamplesImage.
export const latticeSpacing = ({diameter, nominalScale = 1}) => {
    const distance = diameter / nominalScale
    return {distance, dx: distance * SQRT3, dy: distance * 1.5}
}

// ---------------------------------------------------------------------------------------------------------
// RASTER / max-offset contract: minimum spacing floored at 2*scale.
// ---------------------------------------------------------------------------------------------------------

// The minimum lattice exponent for the RASTER path from the configured minimum distance: the nearest hex-cell
// centers are ~sqrt(3)*diameter apart, so the smallest allowed internal diameter is minDistance/sqrt(3).
// minDistance defaults to (and is floored at) 2*scale because the raster generator cannot resolve samples
// closer than ~2 pixels. Used by systematicStratumMaxOffset - do NOT use for the analytical unstratified path.
export const minLatticeExponent = ({minDistance, scale}) => {
    const s = Number(scale)
    const md = Math.max(Number(minDistance) || s * 2, s * 2)
    return Math.ceil(Math.log2(md / SQRT3))
}

// ---------------------------------------------------------------------------------------------------------
// ANALYTICAL UNSTRATIFIED contract: spacing constrained ONLY by minDistance; scale is irrelevant.
// ---------------------------------------------------------------------------------------------------------

// The minimum lattice exponent for the analytical path from the requested minimum distance only. If
// minDistance is unspecified there is NO minimum-distance floor (density is governed purely by the area /
// sampleSize target and densityOffset) - deliberately NOT 2*scale, because scale must not limit an analytical
// grid whose points are exact. Returns -Infinity to mean "no floor" so it disappears under Math.max.
export const unstratifiedMinExponent = ({minDistance}) => {
    const md = Number(minDistance)
    return Number.isFinite(md) && md > 0
        ? Math.ceil(Math.log2(md / SQRT3))
        : Number.NEGATIVE_INFINITY
}

// The analytical lattice exponent: from the target diameter, densified by densityOffset (smaller cells),
// clamped so the requested minimum distance is never violated. 0 = the slack-adjusted base grid. No `scale`.
export const unstratifiedLatticeExponent = ({area, sampleSize, minDistance, densityOffset = 0}) =>
    Math.max(
        Math.floor(Math.log2(targetLatticeDiameter({area, sampleSize}))) - densityOffset,
        unstratifiedMinExponent({minDistance})
    )

// Analytical lattice cell diameter (meters), a power of two. Non-finite area propagates as NaN.
export const unstratifiedLatticeDiameter = args => Math.pow(2, unstratifiedLatticeExponent(args))

// Full analytical layout for the unstratified design: {exponent, diameter, minExponent, distance, dx, dy}.
// `nominalScale` is the projection's nominal scale, not the sampling scale.
export const unstratifiedLatticeLayout = ({area, sampleSize, minDistance, densityOffset = 0, nominalScale = 1}) => {
    const exponent = unstratifiedLatticeExponent({area, sampleSize, minDistance, densityOffset})
    const diameter = Math.pow(2, exponent)
    return {
        exponent,
        diameter,
        minExponent: unstratifiedMinExponent({minDistance}),
        ...latticeSpacing({diameter, nominalScale})
    }
}

// The densest offset the analytical unstratified path may use before the requested minDistance clamp makes
// further densification a no-op. No `scale`: exact analytical points are not limited by raster resolution.
export const unstratifiedMaxDensityOffset = ({area, sampleSize, minDistance}) => {
    const baseExponent = unstratifiedLatticeExponent({area, sampleSize, minDistance})
    const minExponent = unstratifiedMinExponent({minDistance})
    if (!Number.isFinite(baseExponent)) {
        return 0
    }
    if (!Number.isFinite(minExponent)) {
        return MAX_DENSITY_OFFSETS
    }
    return Math.min(MAX_DENSITY_OFFSETS, Math.max(0, baseExponent - minExponent))
}

// ---------------------------------------------------------------------------------------------------------
// Shared cell geometry / identity (contract-independent).
// ---------------------------------------------------------------------------------------------------------

// FIXED grid origin -> zero phase (unshifted global lattice). SEEDED is EE-only (randomColumn) and lives in
// the EE module.
export const fixedOriginPhase = () => ({x: 0, y: 0, i: 0, j: 0})

// Exact projected point for a lattice cell (i, j). Row parity shifts odd rows by dx/2; parity is taken
// sign-safe (0 or 1) so a negative odd j reconstructs the SAME point the raster's floor-based i identifies
// (verified against EE for negative indices). offsetX/offsetY are the origin-phase offsets (0 for FIXED).
export const exactLatticePoint = ({i, j, dx, dy, offsetX = 0, offsetY = 0}) => {
    const parity = ((j % 2) + 2) % 2
    return {
        x: offsetX + i * dx + parity * (dx / 2),
        y: offsetY + j * dy
    }
}

// Nested-level / half-level of a cell, from the seed-shifted indices (iLevel = i + phase.i, jLevel = j +
// phase.j). Faithful JS port of the EE image formula in stratifiedSystematicSampleImage (`include` + the
// level iterate), including its `m === 0` clause (dead, m = 2^(level-1) is never 0) kept for fidelity. Values
// verified against the EE band for representative +/- (i, j).
export const nestedLevel = (iLevel, jLevel) => {
    let level = -Infinity
    for (let n = 0; n <= 4; n++) {
        const m = Math.pow(2, n - 1)
        const mod = (value, k) => Math.abs(value % (m * k)) === 0
        const included =
            (((mod(iLevel, 2) && mod(jLevel, 4)) || (mod(iLevel - m, 2) && !mod(jLevel, 4)))
                && mod(jLevel, 2))
            || m === 0
                ? 1
                : 0
        const half = Math.abs(jLevel % Math.pow(2, n + 1)) === 0 ? 0.5 : 0
        const contribution = included * n + half
        if (contribution > level) {
            level = contribution
        }
    }
    return level
}

// Collision-safe, sign-safe, AOI-independent cell key (the global integer indices), for the vectorized
// FeatureCollection. Usable as a stable randomColumn key for EXACT thinning BEFORE exact geometry exists.
// Replaces the spike's unsafe i*1e5+j (which collided for negative/large j).
export const latticeIdKey = (i, j) => `${i}:${j}`

// Collision-safe NUMERIC cell label for reduceToVectors' connected-component grouping (one component per (i,j)
// cell), needed BEFORE vectorization where only a numeric band works. Packs the two signed indices into a
// single int64: high 32 bits = i, low 32 bits = j (i*2^32 + j in two's-complement). This is a bijection for
// all int32 indices, so it never collides regardless of sign or magnitude - unlike a fixed additive offset,
// which is only conditionally safe. Mirrors the EE band `i.long().leftShift(32).add(j.long())` (same encoding
// randomSampling.js already uses). Returned as a decimal string because the value can exceed 2^53 and must
// stay exact. `i`, `j` MUST be int32-range integers (they come from `.int32()` bands).
export const latticeCellLabel = (i, j) => ((BigInt(i) << 32n) + BigInt(j)).toString()

// Exact-membership predicate for stratified systematic exact locations: a candidate is kept only when the
// stratification class sampled AT ITS EXACT POINT equals the candidate's own stratum. No-data / null (the
// exact point fell on a masked or off-image pixel) is deliberately NOT a match, so such points are dropped -
// even for stratum 0, which must still be a valid comparison. Mirrors the server-side test in
// filterToExactStratificationMembership (which represents no-data with a negative sentinel, since stratum
// class values are non-negative). Kept pure so the null / match / mismatch semantics are unit-tested without
// live EE.
export const isExactMembershipMatch = (sampledClass, stratum) =>
    sampledClass != null && Number(sampledClass) === Number(stratum)
