import {map, of} from 'rxjs'

import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'

import {isStratificationSkipped} from './stratificationSkip.js'

// Resolves the single-band 'stratum' image the samplers consume, locked to the Stratification grid. When
// stratification is skipped (unstratified design) there is no real stratification image - and the stale
// asset/band stored on the model must NOT be loaded, or sampling over an image that lacks class 1 yields an
// empty table. Instead a constant single-stratum image (class 1 everywhere) is used, matching the GUI's
// synthetic stratum 1, and no grid is imposed on it.
//
// Otherwise the configured ASSET/RECIPE image is loaded, its band renamed to 'stratum', and the result
// reprojected onto the Stratification grid. The reproject is UNIFORM for both image kinds: an ASSET carries its
// own projection and a RECIPE is a computed image carrying Earth Engine's degree-scale default, and `reproject`
// is correct for both - it forces computation at the target projection rather than resampling from the default.
// There is no branch and no nominalScale heuristic.

export const stratificationImage$ = (stratification, grid) => {
    if (isStratificationSkipped(stratification)) {
        return of(ee.Image(1).rename('stratum'))
    }
    const bandName = stratification.band
    const recipe = stratification.type === 'RECIPE'
        ? {type: 'RECIPE_REF', id: stratification.recipeId}
        : {type: 'ASSET', id: stratification.assetId}
    // A transform defines alignment AND resolution, so it replaces atScale entirely. The grid arrives already
    // reduced to one definition, so this is a choice between two shapes, never a precedence rule. Recipe values
    // arrive as strings, and atScale needs a number.
    const projection = grid.crsTransform
        ? ee.Projection(grid.crs, grid.crsTransform)
        : ee.Projection(grid.crs).atScale(Number(grid.scale))
    return ImageFactory(recipe, {selection: [bandName]}).getImage$().pipe(
        map(image => image.select(bandName).rename('stratum').reproject(projection))
    )
}
