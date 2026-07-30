import {DEFAULT_SAMPLING_GRID_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {isSkipped} from '#sepal/recipe/samplingDesign/stratificationSkip'

export const DEFAULT_CRS = DEFAULT_SAMPLING_GRID_CRS
export const DEFAULT_SEED = 1

export {isSkipped}

// Seed affects the result only for random sampling, systematic EXACT thinning, or a SEEDED grid start.
export const includeSeed = ({arrangementStrategy, sampleSizeStrategy, gridOrigin}) =>
    arrangementStrategy === 'RANDOM'
        || sampleSizeStrategy === 'EXACT'
        || gridOrigin === 'SEEDED'

export const includeMinDistance = ({arrangementStrategy}) =>
    arrangementStrategy === 'SYSTEMATIC'

// The Arrangement CRS applies only to Unstratified Systematic; stratified designs use the Stratification grid,
// and Unstratified Random has no grid.
export const includeCrs = ({unstratified, arrangementStrategy}) =>
    unstratified && arrangementStrategy === 'SYSTEMATIC'
