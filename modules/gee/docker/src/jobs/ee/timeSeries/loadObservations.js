const {job} = require('root/jobs/job')


const worker$ = ({recipe, latLng}) => {
    const {getCollection$} = require('sepal/ee/timeSeries/collection')
    const {toGeometry} = require('sepal/ee/aoi')
    const {getRows$} = require('sepal/ee/table')
    const {switchMap} = require('rx/operators')
    const ee = require('ee')
    const aoi = {type: 'POINT', ...latLng}
    const geometry = toGeometry(aoi)

    const timeSeriesForPixel$ = collection => {
        const band = recipe.bands[0]
        return collection
            .select(band)
            .map(image => {
                const value = image.reduceRegion({
                    reducer: ee.Reducer.first(),
                    geometry,
                    scale: 10
                }).getNumber(band) // Expect a single band in the recipe
                return ee.Feature(null, {date: image.date(), value})
            })
            .filter(ee.Filter.notNull(['value']))
    }

    const collectionBands = [...new Set([...recipe.bands])]
    return getCollection$({...recipe, bands: collectionBands, aoi}).pipe(
        switchMap(collection => getRows$(
            timeSeriesForPixel$(collection)
        ))
    )
}

module.exports = job({
    jobName: 'LoadCCDCObservations',
    jobPath: __filename,
    worker$
})
