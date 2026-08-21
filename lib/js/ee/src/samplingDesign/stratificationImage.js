import {map, of} from 'rxjs'

import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {resolveStratificationCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'

import {isStratificationSkipped} from './stratificationSkip.js'

// Resolves the single-band 'stratum' image the samplers consume, locked to the Stratification grid. When
// stratification is skipped (unstratified design) there is no real stratification image - and the stale
// asset/band stored on the model must NOT be loaded, or sampling over an image that lacks class 1 yields an
// empty table. Instead a constant single-stratum image (class 1 everywhere) is used, matching the GUI's
// synthetic stratum 1, and no grid is imposed on it.
//
// Otherwise the configured ASSET/RECIPE image is loaded, its band renamed to 'stratum', and the result
// reprojected onto the Stratification projection. The reproject is UNIFORM for both image kinds: an ASSET
// carries its own projection and a RECIPE is a computed image carrying Earth Engine's degree-scale default,
// and `reproject` is correct for both - it forces computation at the target projection rather than resampling
// from the default.

// How close a band's own scale must be to the configured Scale to count as the same grid. A Scale is displayed
// and stored rounded to four decimals, so typing back the 10 m a panel showed differs from the band's own
// 9.999996837 m by a rounding error, not by a resolution.
const NATIVE_SCALE_TOLERANCE_METRES = 0.0001

// The projection every Sampling Design reduction and the final draw runs on. The decision stays INSIDE the
// graph: evaluating a source's projection would cost a round trip per panel keystroke.
//
// Candidates are ORDERED and the first one that already IS the configured grid wins; otherwise the source is
// resampled onto the configured projection. Order matters because `atScale` re-origins at 0,0, so a 30 m
// reduction over 30 m strata must keep the strata lattice rather than cut every stratum boundary. Pass only
// projections that are real grids - a constant image's degree-scale default is not one.
//
// Equivalence is canonical WKT plus nominal scale, and nothing else: `crs()` returns null for a WKT-defined
// projection and `transform()` can return a WKT string rather than six numbers. Every candidate must be the
// projection of a SELECTED band - `image.projection()` throws on a source whose bands differ.
export const stratificationProjection = (candidateProjections, {crs, scale}) => {
    const configured = ee.Projection(resolveStratificationCrs(crs)).atScale(Number(scale))
    const isConfiguredGrid = candidate => candidate.wkt().compareTo(configured.wkt()).eq(0)
        .and(candidate.nominalScale().subtract(Number(scale)).abs().lte(NATIVE_SCALE_TOLERANCE_METRES))
    return ee.Projection(candidateProjections.reduceRight(
        (fallback, candidate) => ee.Algorithms.If(isConfiguredGrid(candidate), candidate, fallback),
        configured
    ))
}

export const stratificationImage$ = (stratification, grid) => {
    if (isStratificationSkipped(stratification)) {
        return of(ee.Image(1).rename('stratum'))
    }
    const bandName = stratification.band
    const recipe = stratification.type === 'RECIPE'
        ? {type: 'RECIPE_REF', id: stratification.recipeId}
        : {type: 'ASSET', id: stratification.assetId}
    return ImageFactory(recipe, {selection: [bandName]}).getImage$().pipe(
        map(image => {
            const selected = image.select(bandName)
            return selected.rename('stratum').reproject(stratificationProjection([selected.projection()], grid))
        })
    )
}
