import {job} from '#gee/jobs/job'
import {toGeometry} from '#sepal/ee/aoi'
import {of, map, switchMap} from 'rxjs'
import ccdc from '#sepal/ee/timeSeries/ccdc'
import imageFactory from '#sepal/ee/imageFactory'
import _ from 'lodash'
import ee from '#sepal/ee/ee'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)

const worker$ = ({
    requestArgs: {recipe, latLng, bands}
}) => {

    const aoi = {type: 'POINT', ...latLng}
    const geometry = toGeometry(aoi)

    const segmentsForPixel$ = segments$ =>
        segments$.pipe(
            switchMap(segments =>
                ee.getInfo$(
                    segments.reduceRegion({
                        reducer: ee.Reducer.first(),
                        geometry,
                        scale: 10,
                        tileScale: 16
                    }),
                    `Get CCDC segments for pixel (${latLng})`
                )
            ),
            map(segments => _.mapValues(segments, value => value || []))
        )

    const assetSegments$ = () =>
        imageFactory({
            type: 'ASSET',
            id: recipe.id
        }).getImage$()

    const recipeRef$ = () => imageFactory(recipe, {selection: recipe.targetType === 'ASSET_MOSAIC' ? [] : bands}).getRecipe$()

    const recipeSegments$ = () =>
        of(ccdc(
            _.merge(recipe, {model: {aoi: {type: 'POINT', ...latLng}}}),
            {selection: bands}
        ))

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
    jobPath: __filename,
    worker$
})
