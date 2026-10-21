import _ from 'lodash'
import {defer, map, mergeMap, of, switchMap, toArray} from 'rxjs'

import {requireExecutable$} from '#gee/jobs/executionReadiness'
import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {loadRecipe$} from '#sepal/ee/recipe'
import {unsupportedClassifiedOutput} from '#sepal/ee/timeSeries/classifiedOutputRefusal'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {ClientException} from '#sepal/exception'
import {fileName} from '#sepal/path'
import {observedCollection} from '#sepal/recipe/changeAlerts/observedCollection'
import {pixelObservationsOperation, unprovidedClassifiedOutputs} from '#sepal/recipe/classifiedOutputs'
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
    
    return defer(() => of(observed(requested))).pipe(
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

// A recipe is held to what its type declares its pixel observations of the bands requested require (executionReadiness.js,
// pixelObservationsOperation) before the pixel or the collection is built, its own image never described. The
// collection is observed at the clicked point, so that is the recipe judged: its AOI, which nothing here reads, is no
// dependency of it. Establishing readiness may itself read Earth Engine.
//
// A band the Classification computes is judged in the order building the collection finds things (collection.js): what
// any band needs, then whether the Classification provides it - refused as the collection refuses it - and only then
// what training it needs.
const ready$ = (recipe, pixel, bands) => {
    const judged = atPixel(recipe, pixel)
    const operation = pixelObservationsOperation(bands)
    const observable$ = requireExecutable$({recipe: judged, operation: PIXEL_OBSERVATIONS})
    return operation === PIXEL_OBSERVATIONS
        ? observable$
        : observable$.pipe(
            switchMap(() => provided$(recipe, bands)),
            switchMap(() => requireExecutable$({recipe: judged, operation}))
        )
}

// The Classification is read as the readiness read it, once per request (recipeScope.js), and its outputs judged by
// the rule its record declares them by (unprovidedClassifiedOutputs).
const provided$ = (recipe, bands) => {
    const classificationId = recipe.model.sources?.classification
    return classificationId
        ? loadRecipe$(classificationId).pipe(
            map(classification => {
                const unsupported = unprovidedClassifiedOutputs(classification, bands)
                if (unsupported.length) {
                    throw unsupportedClassifiedOutput(classificationId, unsupported)
                }
            })
        )
        : of(undefined)
}

// What a request observes: a Time Series' or a CCDC's own collection, or the one a Change Alerts recipe monitors
// (observedCollection). Settings naming no recipe type are no recipe anything here can hold to what it requires.
const observed = recipe => {
    if (!recipe?.type) {
        throw new ClientException('Observations are loaded for a recipe of a type', {statusCode: 400})
    }
    return recipe.type === 'CHANGE_ALERTS' ? observedCollection(recipe) : recipe
}

const atPixel = (recipe, pixel) =>
    ({...recipe, model: {...recipe.model, aoi: pixel}})

export default job({
    jobName: 'Load observations',
    jobPath: fileName(import.meta.url),
    worker$
})
