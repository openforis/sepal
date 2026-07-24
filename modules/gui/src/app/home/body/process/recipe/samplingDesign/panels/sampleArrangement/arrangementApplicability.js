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

// A grid applies to every mode except unstratified Random.
export const includeCrs = ({unstratified, arrangementStrategy}) =>
    !unstratified || arrangementStrategy === 'SYSTEMATIC'
