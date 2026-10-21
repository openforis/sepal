import _ from 'lodash'
import {map, switchMap} from 'rxjs'

import {requireExecutable$} from '#gee/jobs/executionReadiness'
import {job} from '#gee/jobs/job'
import {requireRequestedBands$} from '#gee/jobs/requestedBands'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {loadRecipe$} from '#sepal/ee/recipe'
import ccdc from '#sepal/ee/timeSeries/ccdc'
import {withSegmentSource$} from '#sepal/ee/timeSeries/segmentSource'
import {fileName} from '#sepal/path'
import {IMAGE_OUTPUT, PIXEL_SEGMENTS} from '#sepal/recipe/output/readiness'
import {fittedMeasures} from '#sepal/recipe/type/ccdc'

const worker$ = ({
    requestArgs: {recipe, latLng, bands}
}) => {

    const aoi = {type: 'POINT', ...latLng}

    // The pixel is built only once there are segments to read at it: a request refused builds neither.
    const segmentsForPixel$ = segments$ =>
        segments$.pipe(
            switchMap(segments =>
                toGeometry$(aoi).pipe(
                    switchMap(geometry =>
                        ee.getInfo$(
                            segments.reduceRegion({
                                reducer: ee.Reducer.first(),
                                geometry,
                                scale: 10,
                                tileScale: 16
                            }),
                            `Get CCDC segments for pixel (${latLng})`
                        )
                    )
                )
            ),
            map(segments => _.mapValues(segments, value => value || []))
        )

    const assetSegments$ = () =>
        imageFactory({
            type: 'ASSET',
            id: recipe.id
        }).getImage$()

    // The recipe selected builds its own image, over its own AOI, so that image's readiness is what is required of it.
    const recipeRef$ = () => loadRecipe$(recipe.id).pipe(
        switchMap(record => requireExecutable$({recipe: record, operation: IMAGE_OUTPUT})),
        switchMap(() => withSegmentSource$(recipe, ({selectableBaseBands}, buildImage) =>
            buildImage({selection: selectableBaseBands ? bands : []})))
    )

    // A CCDC charted itself is segmented at the clicked point, which stands in for its AOI: what is judged is what runs,
    // the measures requested fitted with its breakpoint bands (fittedMeasures), as ccdc.js fits them.
    const recipeSegments$ = () => {
        const atPixel = {...recipe, model: {...recipe.model, aoi}}
        return requireRequestedBands$({
            recipe: atPixel, operation: PIXEL_SEGMENTS, requested: bands, effective: fittedMeasures(atPixel.model, bands)
        }).pipe(
            map(() => ccdc(atPixel, {selection: bands}))
        )
    }

    const segments$ = recipe.type === 'ASSET'
        ? assetSegments$()
        : (recipe.type === 'RECIPE_REF'
            ? recipeRef$()
            : recipeSegments$()
        ).pipe(
            switchMap(ccdc => ccdc.getImage$())
        )
    return segmentsForPixel$(segments$)
}

export default job({
    jobName: 'LoadCCDCSegments',
    jobPath: fileName(import.meta.url),
    worker$
})
