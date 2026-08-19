import {resolveMinDistance} from '#sepal/recipe/samplingDesign/samplingGrid'
import {DEFAULT_SAMPLING_GRID_CRS, resolveSamplingGrid, resolveStratificationGrid} from '#sepal/recipe/samplingDesign/samplingGridCrs'

import {isStratificationSkipped} from './stratificationSkip.js'

// The single effective arrangement consumed by export, validation, Earth Engine and reproduction metadata. A
// field or GRID that does not apply to a mode is ABSENT, so a dormant saved value can never reach the draw,
// validation or the metadata.
//
// The two grids are separate concerns and never collapse into one {crs, scale}: `stratificationGrid` interprets
// the categorical source (any projected CRS), `arrangementGrid` places the samples (curated equal-area CRS only).
export const effectiveArrangement = ({stratification, sampleArrangement}) => {
    const random = sampleArrangement.arrangementStrategy === 'RANDOM'
    const seed = sampleArrangement.seed
    const arrangementGrid = {crs: sampleArrangement.crs || DEFAULT_SAMPLING_GRID_CRS}

    if (!isStratificationSkipped(stratification)) {
        const stratificationGrid = {crs: stratification.crs, scale: stratification.scale}
        return random
            ? {arrangementStrategy: 'RANDOM', seed, stratificationGrid, arrangementGrid}
            : {
                arrangementStrategy: 'SYSTEMATIC',
                sampleSizeStrategy: sampleArrangement.sampleSizeStrategy,
                gridOrigin: sampleArrangement.gridOrigin,
                seed,
                // Unset resolves to the floor (2 * Stratification pixel size); an explicit value passes through
                // unchanged so a below-floor entry still fails validation rather than being silently corrected.
                minDistance: resolveMinDistance({minDistance: sampleArrangement.minDistance, scale: stratification.scale}),
                stratificationGrid,
                arrangementGrid
            }
    }

    return random
        ? {arrangementStrategy: 'RANDOM', seed}
        : {
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: sampleArrangement.sampleSizeStrategy,
            gridOrigin: sampleArrangement.gridOrigin,
            seed,
            // Blank means "no additional spacing constraint" for unstratified systematic.
            minDistance: sampleArrangement.minDistance,
            arrangementGrid
        }
}

// Resolve both grids for the Earth Engine boundary in one place, so every consumer resolves them the same way
// and an absent grid stays absent. Each grid keeps its configured id as `crsId`; the WKT is the EE value only.
export const resolveArrangementGrids = arrangement => ({
    ...arrangement,
    ...(arrangement.stratificationGrid
        ? {stratificationGrid: resolveStratificationGrid(arrangement.stratificationGrid)}
        : {}),
    ...(arrangement.arrangementGrid
        ? {arrangementGrid: resolveSamplingGrid(arrangement.arrangementGrid)}
        : {})
})
