import {DEFAULT_SAMPLING_GRID_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {requiresSamplingSeed} from '#sepal/recipe/samplingDesign/samplingSeed'
import {isSkipped} from '#sepal/recipe/samplingDesign/stratificationSkip'

export const DEFAULT_CRS = DEFAULT_SAMPLING_GRID_CRS
export const DEFAULT_SEED = 1

export {isSkipped}

export const includeSeed = requiresSamplingSeed

export const includeMinDistance = ({arrangementStrategy}) =>
    arrangementStrategy === 'SYSTEMATIC'

// The Arrangement CRS is the PLACEMENT grid, owned by Sample Arrangement in every mode that places samples on a
// grid. Only Unstratified Random has no grid at all.
export const includeCrs = ({unstratified, arrangementStrategy}) =>
    !(unstratified && arrangementStrategy === 'RANDOM')
