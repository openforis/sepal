export const DEFAULT_CRS = 'EPSG:3410'
export const DEFAULT_SEED = 1

// Whether the seed materially affects a systematic draw (seeded grid origin or exact thinning), used both
// to auto-reveal the seed control and to decide the initial "More" state. (Random always uses the seed,
// but keeps its collapsed default.)
export const isSeedRelevantValues = ({arrangementStrategy, sampleSizeStrategy, gridOrigin}) =>
    arrangementStrategy === 'SYSTEMATIC'
        && (gridOrigin === 'SEEDED' || sampleSizeStrategy === 'EXACT')

// Pure decision for opening "More" on mount: true only when advanced values differ from their effective
// defaults, so a new recipe (all fields undefined) opens collapsed. Applying the effective defaults here
// makes it safe to run before the form defaults are set.
export const shouldShowMore = ({crs, crsTransform, seed, arrangementStrategy, sampleSizeStrategy, gridOrigin}) => {
    const effectiveCrs = crs || DEFAULT_CRS
    const effectiveSeed = seed === undefined || seed === null || seed === ''
        ? DEFAULT_SEED
        : parseInt(seed)
    return effectiveCrs !== DEFAULT_CRS
        || !!crsTransform
        || effectiveSeed !== DEFAULT_SEED
        || isSeedRelevantValues({arrangementStrategy, sampleSizeStrategy, gridOrigin})
}
