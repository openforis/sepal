import _ from 'lodash'
import {defer, map, mergeMap, of, switchMap, toArray} from 'rxjs'

import {requireExecutable$} from '#gee/jobs/executionReadiness'
import {job} from '#gee/jobs/job'
import {requireRequestedBands$} from '#gee/jobs/requestedBands'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {effectiveChangeAlerts, segmentSourceFacts$} from '#sepal/ee/timeSeries/segmentSource'
import {ClientException} from '#sepal/exception'
import {fileName} from '#sepal/path'
import {observedCollection} from '#sepal/recipe/changeAlerts/observedCollection'
import {PIXEL_OBSERVATIONS} from '#sepal/recipe/output/readiness'

const CHUNK_SIZE = 100

const worker$ = ({
    requestArgs: {recipe: requested, bands, latLng}
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
    
    return defer(() => observed$(requested)).pipe(
        switchMap(recipe => ready$(recipe, aoi, bands).pipe(map(() => recipe))),
        switchMap(recipe => toGeometry$(aoi).pipe(map(geometry => ({recipe, geometry})))),
        switchMap(({recipe, geometry}) => getCollection$({recipe, bands, geometry}).pipe(
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

// A recipe is held to what its type declares its pixel observations require, and to the bands requested
// (requireRequestedBands$), before the pixel or the collection is built, its own image never described. The collection is
// observed at the clicked point, so that is the recipe judged: its AOI, which nothing here reads, is no dependency of it.
const ready$ = (recipe, pixel, bands) =>
    requireRequestedBands$({recipe: atPixel(recipe, pixel), operation: PIXEL_OBSERVATIONS, requested: bands})

// What a request observes: a Time Series' or a CCDC's own collection, or the one a Change Alerts recipe monitors
// (observedCollection). Settings naming no recipe type are no recipe anything here can hold to what it requires.
const observed$ = recipe => {
    if (!recipe?.type) {
        throw new ClientException('Observations are loaded for a recipe of a type', {statusCode: 400})
    }
    return recipe.type === 'CHANGE_ALERTS'
        ? segmentSourceFacts$(recipe.model.reference).pipe(
            map(({processing}) => effectiveChangeAlerts(recipe, processing)),
            switchMap(effective => requireExecutable$({recipe: effective, operation: PIXEL_OBSERVATIONS}).pipe(
                map(() => observedCollection(effective))
            ))
        )
        : of(recipe)
}

const atPixel = (recipe, pixel) =>
    ({...recipe, model: {...recipe.model, aoi: pixel}})

export default job({
    jobName: 'Load observations',
    jobPath: fileName(import.meta.url),
    worker$
})
