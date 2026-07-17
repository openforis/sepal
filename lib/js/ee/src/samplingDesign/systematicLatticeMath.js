// Pure lattice math shared by EE graph builders and tests.
// Raster paths have a 2*scale spacing floor; analytical unstratified paths do not.

export const SQRT3 = Math.sqrt(3)

// Shared parser for EE's 6-number affine transform form.
export const parseCrsTransform = crsTransform => {
    const parts = Array.isArray(crsTransform)
        ? crsTransform.map(Number)
        : typeof crsTransform === 'string' && crsTransform.trim()
            ? crsTransform.replace(/[[\]]/g, '').split(',').map(part => Number(part.trim()))
            : []
    return parts.length === 6 && parts.every(Number.isFinite) ? parts : null
}

// North-up, axis-aligned, square, non-zero: no shear (b=d=0), east-positive (a>0), north-up (e<0), square (a=-e).
export const isAxisAlignedTransform = transform =>
    Array.isArray(transform) && transform.length === 6
        && transform[1] === 0 && transform[3] === 0
        && transform[0] > 0 && transform[4] < 0 && transform[0] === -transform[4]

// Grid pixel size in metres: transform pixel width when transform-defined, otherwise scale.
export const gridPixelSize = ({scale, crsTransform}) => {
    const transform = parseCrsTransform(crsTransform)
    return transform ? Math.abs(transform[0]) : Number(scale)
}

// EE reduceRegion/reproject grid fields: scale and crsTransform are MUTUALLY EXCLUSIVE. A (parsed) transform is
// the sole grid definition - `{crs, crsTransform}`, never scale; otherwise `{crs, scale}`. Spread into a
// reduceRegion so a transform-defined grid can't also send scale (which EE forbids).
export const crsGridArgs = ({crs, scale, crsTransform}) => {
    const transform = parseCrsTransform(crsTransform)
    return transform
        ? {crs, crsTransform: transform}
        : {crs, scale}
}

// Bias the base grid slightly denser than the area-only estimate.
export const BASE_GRID_SLACK = 0.75

// Root period exponent (metres, power of two) for the seeded lattice phase; every generated diameter divides
// it, so seeded phases stay compatible across densities. Used by the raster preview / feature-source path.
export const ROOT_DIAMETER_EXPONENT = 32

// Densest offset any stratum may densify to before the min-distance clamp makes it a no-op.
export const MAX_DENSITY_OFFSETS = 24

// Area-only target diameter, slack-adjusted.
export const targetLatticeDiameter = ({area, sampleSize}) =>
    0.5 * Math.sqrt(8 * Number(area) / (3 * SQRT3 * Number(sampleSize))) * BASE_GRID_SLACK

// Cell spacing in sampling-projection units; nominalScale is projection scale, not sampling scale.
export const latticeSpacing = ({diameter, nominalScale = 1}) => {
    const distance = diameter / nominalScale
    return {distance, dx: distance * SQRT3, dy: distance * 1.5}
}

// ---------------------------------------------------------------------------------------------------------
// RASTER / max-offset contract: minimum spacing floored at 2*scale.
// ---------------------------------------------------------------------------------------------------------

// Raster minimum exponent: minDistance is floored at 2*scale.
export const minLatticeExponent = ({minDistance, scale}) => {
    const s = Number(scale)
    const md = Math.max(Number(minDistance) || s * 2, s * 2)
    return Math.ceil(Math.log2(md / SQRT3))
}

// ---------------------------------------------------------------------------------------------------------
// ANALYTICAL UNSTRATIFIED contract: spacing constrained ONLY by minDistance; scale is irrelevant.
// ---------------------------------------------------------------------------------------------------------

// Analytical minimum exponent: only minDistance constrains spacing.
export const unstratifiedMinExponent = ({minDistance}) => {
    const md = Number(minDistance)
    return Number.isFinite(md) && md > 0
        ? Math.ceil(Math.log2(md / SQRT3))
        : Number.NEGATIVE_INFINITY
}

// Analytical lattice exponent; no scale floor.
export const unstratifiedLatticeExponent = ({area, sampleSize, minDistance, densityOffset = 0}) =>
    Math.max(
        Math.floor(Math.log2(targetLatticeDiameter({area, sampleSize}))) - densityOffset,
        unstratifiedMinExponent({minDistance})
    )

// Analytical lattice cell diameter (meters), a power of two. Non-finite area propagates as NaN.
export const unstratifiedLatticeDiameter = args => Math.pow(2, unstratifiedLatticeExponent(args))

// Full analytical layout for the unstratified design.
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

// Densest offset before the requested minDistance clamp makes further densification a no-op.
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

// FIXED grid origin: zero integer coset on the global lattice.
export const fixedOriginPhase = () => ({i: 0, j: 0})

// Exact projected point for a lattice cell; row parity is sign-safe for negative j.
export const exactLatticePoint = ({i, j, dx, dy, offsetX = 0, offsetY = 0}) => {
    const parity = ((j % 2) + 2) % 2
    return {
        x: offsetX + i * dx + parity * (dx / 2),
        y: offsetY + j * dy
    }
}

// JS mirror of the EE nested-level image formula.
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

// Stable string key for a global lattice cell.
export const latticeIdKey = (i, j) => `${i}:${j}`

// Numeric reduceToVectors label: int64 bit-pack of signed int32 i/j. Returned as a string to stay exact.
export const latticeCellLabel = (i, j) => ((BigInt(i) << 32n) + BigInt(j)).toString()
