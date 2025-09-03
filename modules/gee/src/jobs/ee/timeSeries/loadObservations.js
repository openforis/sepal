const {job} = require('#gee/jobs/job')

const CHUNK_SIZE = 100

const worker$ = ({
    requestArgs: {recipe, bands, latLng}
}) => {
    const {getCollection$} = require('#sepal/ee/timeSeries/collection')
    const {toGeometry} = require('#sepal/ee/aoi')
    const {map, mergeMap, of, switchMap, toArray} = require('rxjs')
    const ee = require('#sepal/ee/ee')
    const _ = require('lodash')

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

module.exports = job({
    jobName: 'Load observations',
    jobPath: __filename,
    worker$
})
