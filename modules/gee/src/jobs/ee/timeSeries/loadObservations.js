import _ from 'lodash'
import {map, mergeMap, of, switchMap, toArray} from 'rxjs'

import {job} from '#gee/jobs/job'
import {resolveImageOutput$} from '#gee/jobs/task/export/imageOutput'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {fileName} from '#sepal/path'

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
    
    return ready$(recipe).pipe(
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

// A Time Series is held to what its image output requires (imageOutput.js) before the pixel or the collection is built:
// the chart reads a collection band rather than the count, but every requirement on that image concerns the collection
// both build. Establishing readiness may itself read Earth Engine. CCDC asks with its own recipe, whose image output is
// not this collection, and Change Alerts with a bare model, so neither is held to anything here.
const ready$ = recipe =>
    recipe.type === 'TIME_SERIES'
        ? resolveImageOutput$(recipe)
        : of(null)

export default job({
    jobName: 'Load observations',
    jobPath: fileName(import.meta.url),
    worker$
})
