import {map, of} from 'rxjs'

import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'

import {isStratificationSkipped} from './stratificationSkip.js'

// Resolves the single-band 'stratum' image the samplers consume. When stratification is skipped
// (unstratified design) there is no real stratification image - and the stale asset/band stored on the
// model must NOT be loaded, or sampling over an image that lacks class 1 yields an empty table. Instead
// a constant single-stratum image (class 1 everywhere) is used, matching the GUI's synthetic stratum 1.
// Otherwise the configured ASSET/RECIPE image is loaded and its band renamed to 'stratum'.

export const stratificationImage$ = stratification => {
    if (isStratificationSkipped(stratification)) {
        return of(ee.Image(1).rename('stratum'))
    }
    const bandName = stratification.band
    const recipe = stratification.type === 'RECIPE'
        ? {type: 'RECIPE_REF', id: stratification.recipeId}
        : {type: 'ASSET', id: stratification.assetId}
    return ImageFactory(recipe, {selection: [bandName]}).getImage$().pipe(
        map(image => image.select(bandName).rename('stratum'))
    )
}
