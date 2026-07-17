import {DEFAULT_SAMPLING_GRID_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'

import {isStratificationSkipped} from './stratificationSkip.js'

// Grid ownership depends on mode; sampling rules always come from sampleArrangement.
// Stratified designs use Stratification's grid. Unstratified designs use Arrangement's grid.
export const effectiveArrangement = ({stratification, sampleArrangement}) => {
    if (!isStratificationSkipped(stratification)) {
        return {
            ...sampleArrangement,
            // EE grids are defined by either scale or transform, never both.
            scale: stratification.crsTransform ? undefined : stratification.scale,
            crs: stratification.crs || DEFAULT_SAMPLING_GRID_CRS,
            crsTransform: stratification.crsTransform || ''
        }
    }
    const arrangement = {...sampleArrangement, crs: sampleArrangement.crs || DEFAULT_SAMPLING_GRID_CRS}
    return sampleArrangement.arrangementStrategy === 'RANDOM'
        ? arrangement
        : {...arrangement, scale: undefined}
}
