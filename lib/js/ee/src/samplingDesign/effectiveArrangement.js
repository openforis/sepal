import {resolveMinDistance} from '#sepal/recipe/samplingDesign/samplingGrid'
import {DEFAULT_SAMPLING_GRID_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'

import {isStratificationSkipped} from './stratificationSkip.js'

// minDistance is a Systematic-only setting. The model keeps its value dormant so switching back to Systematic
// has a usable default, so the effective arrangement is where a stale random minDistance is dropped - a random
// draw must be identical whether or not an old recipe still carries one.
const withoutSystematicOnlySettings = ({minDistance: _minDistance, ...arrangement}) => arrangement

// Grid ownership depends on mode; sampling rules always come from sampleArrangement.
// Stratified designs use Stratification's grid. Unstratified designs use Arrangement's grid.
export const effectiveArrangement = ({stratification, sampleArrangement}) => {
    const random = sampleArrangement.arrangementStrategy === 'RANDOM'
    const applicable = random ? withoutSystematicOnlySettings(sampleArrangement) : sampleArrangement
    if (!isStratificationSkipped(stratification)) {
        const grid = {
            // EE grids are defined by either scale or transform, never both.
            scale: stratification.crsTransform ? undefined : stratification.scale,
            crs: stratification.crs || DEFAULT_SAMPLING_GRID_CRS,
            crsTransform: stratification.crsTransform || ''
        }
        return {
            ...applicable,
            ...grid,
            // Minimum distance is optional: an unset value resolves to the closest spacing this grid allows, so
            // candidate generation, density/repair, advice and reproduction metadata all see the real distance.
            // An explicit value passes through unchanged, so a below-floor entry still fails validation.
            ...(random ? {} : {minDistance: resolveMinDistance({minDistance: applicable.minDistance, scale: stratification.scale, crsTransform: stratification.crsTransform})})
        }
    }
    const arrangement = {...applicable, crs: applicable.crs || DEFAULT_SAMPLING_GRID_CRS}
    return random
        ? arrangement
        : {...arrangement, scale: undefined}
}
