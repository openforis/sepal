import {DEFAULT_SAMPLING_GRID_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {requiresSamplingSeed} from '#sepal/recipe/samplingDesign/samplingSeed'
import {isSkipped} from '#sepal/recipe/samplingDesign/stratificationSkip'

export const DEFAULT_CRS = DEFAULT_SAMPLING_GRID_CRS
export const DEFAULT_SEED = 1

export {isSkipped}

export const includeSeed = requiresSamplingSeed

export const includeMinDistance = ({arrangementStrategy}) =>
    arrangementStrategy === 'SYSTEMATIC'

// The Arrangement CRS applies only to Unstratified Systematic; stratified designs use the Stratification grid,
// and Unstratified Random has no grid.
export const includeCrs = ({unstratified, arrangementStrategy}) =>
    unstratified && arrangementStrategy === 'SYSTEMATIC'
