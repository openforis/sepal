import {DEFAULT_SAMPLING_GRID_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'

export const DEFAULT_CRS = DEFAULT_SAMPLING_GRID_CRS
export const DEFAULT_SEED = 1

// Unstratified when stratification is skipped (boolean true, or a non-empty skip array). Gates the grid
// CRS/transform and the More button - this panel owns the grid only for unstratified designs.
export const isSkipped = skip => skip === true || (Array.isArray(skip) && skip.length > 0)

// Seed is relevant (shown inline) only for random sampling, systematic EXACT thinning, or a random/SEEDED grid
// start; hidden otherwise.
export const includeSeed = ({arrangementStrategy, sampleSizeStrategy, gridOrigin}) =>
    arrangementStrategy === 'RANDOM'
        || sampleSizeStrategy === 'EXACT'
        || gridOrigin === 'SEEDED'

// Minimum distance is a Systematic-only setting: it constrains the systematic grid spacing and has no meaning
// for random sampling. One predicate drives both field applicability and rendering, so they cannot diverge.
export const includeMinDistance = ({arrangementStrategy}) =>
    arrangementStrategy === 'SYSTEMATIC'

// Pure decision for opening "More" on mount: true only when an advanced GRID value (CRS or CRS transform)
// differs from its effective default. More reveals only CRS/transform now - seed moved inline (shown whenever
// relevant), so it no longer opens More. A new recipe (all fields undefined) opens collapsed. Applying the
// effective CRS default here makes it safe to run before the form defaults are set.
export const shouldShowMore = ({crs, crsTransform}) => {
    const effectiveCrs = crs || DEFAULT_CRS
    return effectiveCrs !== DEFAULT_CRS || !!crsTransform
}
