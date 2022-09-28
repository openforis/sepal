const {job} = require('gee/jobs/job')

const worker$ = ({recipe, bands, latLng}) => {
    const {getCollection$} = require('sepal/ee/timeSeries/collection')
    const {toGeometry} = require('sepal/ee/aoi')
    const {getRows$} = require('sepal/ee/table')
    const {switchMap} = require('rxjs')
    const ee = require('sepal/ee')
    const aoi = {type: 'POINT', ...latLng}
    const geometry = toGeometry(aoi)

    const timeSeriesForPixel$ = collection => {
        const band = bands[0] // We only support one band at the moment
        return collection
            .select(band)
            .map(image => {
                const value = image.reduceRegion({
                    reducer: ee.Reducer.first(),
                    geometry,
                    scale: 10,
                    tileScale: 16
                }).getNumber(band) // Expect a single band in the recipe
                return ee.Feature(null, {date: image.date(), value})
            })
            .filter(ee.Filter.notNull(['value']))
    }
    return getCollection$({recipe, bands, geometry}).pipe(
        switchMap(collection => getRows$(
            timeSeriesForPixel$(collection)
        ))
    )
}

module.exports = job({
    jobName: 'Load observations',
    jobPath: __filename,
    worker$
})
