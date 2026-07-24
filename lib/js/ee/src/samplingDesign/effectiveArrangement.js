import {resolveMinDistance} from '#sepal/recipe/samplingDesign/samplingGrid'
import {DEFAULT_SAMPLING_GRID_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'

import {isStratificationSkipped} from './stratificationSkip.js'

// The single effective arrangement consumed by export, validation, Earth Engine and reproduction metadata. A
// field that does not apply to a mode is ABSENT, so a dormant saved value can never reach the draw, validation
// or the metadata.
export const effectiveArrangement = ({stratification, sampleArrangement}) => {
    const random = sampleArrangement.arrangementStrategy === 'RANDOM'
    const seed = sampleArrangement.seed

    if (!isStratificationSkipped(stratification)) {
        // One equal-area grid owned by Stratification: it evaluates the classes AND places the samples, so the
        // Arrangement CRS is not consulted for stratified designs.
        const grid = {scale: stratification.scale, crs: stratification.crs || DEFAULT_SAMPLING_GRID_CRS}
        return random
            ? {arrangementStrategy: 'RANDOM', seed, ...grid}
            : {
                arrangementStrategy: 'SYSTEMATIC',
                sampleSizeStrategy: sampleArrangement.sampleSizeStrategy,
                gridOrigin: sampleArrangement.gridOrigin,
                seed,
                ...grid,
                // Unset resolves to the floor (2 * Scale); an explicit value passes through unchanged so a
                // below-floor entry still fails validation rather than being silently corrected.
                minDistance: resolveMinDistance({minDistance: sampleArrangement.minDistance, scale: stratification.scale})
            }
    }

    return random
        ? {arrangementStrategy: 'RANDOM', seed}
        : {
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: sampleArrangement.sampleSizeStrategy,
            gridOrigin: sampleArrangement.gridOrigin,
            seed,
            // Unstratified Systematic has no Stratification grid, so Sample Arrangement owns its CRS.
            crs: sampleArrangement.crs || DEFAULT_SAMPLING_GRID_CRS,
            // Blank means "no additional spacing constraint" for unstratified systematic.
            minDistance: sampleArrangement.minDistance
        }
}
