export const DEFAULT_CRS = 'EPSG:3410'
export const DEFAULT_SEED = 1

// Pure decision for opening "More" on mount: true only when an advanced value (CRS, CRS transform, or seed)
// differs from its effective default. A new recipe (all fields undefined) opens collapsed, and so does a
// saved recipe that only uses Grid start: Random (SEEDED) or EXACT thinning at the DEFAULT seed - the seed
// stays an advanced setting the user opens "More" to reach. Applying the effective defaults here makes it
// safe to run before the form defaults are set.
export const shouldShowMore = ({crs, crsTransform, seed}) => {
    const effectiveCrs = crs || DEFAULT_CRS
    const effectiveSeed = seed === undefined || seed === null || seed === ''
        ? DEFAULT_SEED
        : parseInt(seed)
    return effectiveCrs !== DEFAULT_CRS
        || !!crsTransform
        || effectiveSeed !== DEFAULT_SEED
}
