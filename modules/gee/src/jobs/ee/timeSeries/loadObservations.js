import _ from 'lodash'
import {map, mergeMap, of, switchMap, toArray} from 'rxjs'

import {requireExecutable$} from '#gee/jobs/executionReadiness'
import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {fileName} from '#sepal/path'
import {PIXEL_OBSERVATIONS} from '#sepal/recipe/output/readiness'

const CHUNK_SIZE = 100

const worker$ = ({
    requestArgs: {recipe, bands, latLng}
}) => {

    const aoi = {type: 'POINT', ...latLng}

    const band = bands[0]

    const timeSeriesForPixel$ = (collection, geometry) =>
        ee.getInfo$(collection
            .select(band)
            .map(image =>
                image.addBands(
                    ee.Image(image.date().millis()).int64()
                )
            )
            .toArray()
            .reduceRegion({
                reducer: ee.Reducer.first(),
                geometry,
                scale: 10,
                tileScale: 16
            })
            .get('array'), 'Extract chunk'
        )
    
    return ready$(recipe, aoi).pipe(
        switchMap(() => toGeometry$(aoi)),
        switchMap(geometry => getCollection$({recipe, bands, geometry}).pipe(
            switchMap(collection => ee.getInfo$(collection.aggregate_array('system:index')).pipe(
                switchMap(indexes => of(..._.chunk(indexes, CHUNK_SIZE))),
                mergeMap(indexChunk =>
                    timeSeriesForPixel$(
                        collection.filter(ee.Filter.inList('system:index', indexChunk)),
                        geometry
                    )
                , 4),
                toArray(),
                map(observations => {
                    return ({
                        features: observations.filter(chunk => chunk).flat(1).map(([value, date]) => ({
                            properties: {
                                date: {value: date},
                                value
                            }
                        }))
                    })
                })
            ))
        ))
    )
}

// A recipe is held to what its type declares its pixel observations require (executionReadiness.js) before the pixel or
// the collection is built, its own image never described. The collection is observed at the clicked point, so that is
// the recipe judged: its AOI, which nothing here reads, is no dependency of it. Establishing readiness may itself read
// Earth Engine. Change Alerts asks with collection settings alone, no recipe, and is held to nothing here.
const ready$ = (recipe, pixel) =>
    recipe.type
        ? requireExecutable$({recipe: atPixel(recipe, pixel), operation: PIXEL_OBSERVATIONS})
        : of(null)

const atPixel = (recipe, pixel) =>
    ({...recipe, model: {...recipe.model, aoi: pixel}})

export default job({
    jobName: 'Load observations',
    jobPath: fileName(import.meta.url),
    worker$
})
