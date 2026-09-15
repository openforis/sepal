import _ from 'lodash'
import {map, of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import ccdc from '#sepal/ee/timeSeries/ccdc'
import {withSegmentSource$} from '#sepal/ee/timeSeries/segmentSource'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {recipe, latLng, bands}
}) => {

    const aoi = {type: 'POINT', ...latLng}

    const segmentsForPixel$ = segments$ =>
        toGeometry$(aoi).pipe(
            switchMap(geometry =>
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

    const recipeRef$ = () => withSegmentSource$(recipe, ({selectableBaseBands}, buildImage) =>
        buildImage({selection: selectableBaseBands ? bands : []}))

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
    jobPath: fileName(import.meta.url),
    worker$
})
