import {job} from '#gee/jobs/job'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {toGeometry} from '#sepal/ee/aoi'
import {map, mergeMap, of, switchMap, toArray} from 'rxjs'
import ee from '#sepal/ee/ee'
import _ from 'lodash'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)

const CHUNK_SIZE = 100

const worker$ = ({
    requestArgs: {recipe, bands, latLng}
}) => {

    const aoi = {type: 'POINT', ...latLng}
    const geometry = toGeometry(aoi)

    const band = bands[0]

    const timeSeriesForPixel$ = collection =>
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
    
    return getCollection$({recipe, bands, geometry}).pipe(
        switchMap(collection => ee.getInfo$(collection.aggregate_array('system:index')).pipe(
            switchMap(indexes => of(..._.chunk(indexes, CHUNK_SIZE))),
            mergeMap(indexChunk =>
                timeSeriesForPixel$(
                    collection.filter(ee.Filter.inList('system:index', indexChunk))
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
    )
}

export default job({
    jobName: 'Load observations',
    jobPath: __filename,
    worker$
})
