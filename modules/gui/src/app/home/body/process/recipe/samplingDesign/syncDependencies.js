import {isSkipped} from '#sepal/recipe/samplingDesign/stratificationSkip'

// A changed section invalidates the section that derives from it.
export const DEPENDENCIES = {
    aoi: 'stratification',
    stratification: 'proportions',
    proportions: 'sampleAllocation'
}

// A stratified design evaluates its stratum areas at the arrangement CRS, so changing it must mark the strata
// stale (cascading via DEPENDENCIES). Unstratified areas come from AOI geometry, so a CRS change there does not.
export const arrangementCrsInvalidatesStratification = (prev, next) =>
    !isSkipped(next?.stratification?.skip)
        && prev?.sampleArrangement?.crs !== next?.sampleArrangement?.crs
