const {job} = require('root/jobs/job')


const worker$ = ({recipe, latLng}) => {
    const {getCollection$} = require('sepal/ee/timeSeries/collection')
    const {getSegments$} = require('sepal/ee/timeSeries/ccdc')
    const {toGeometry} = require('sepal/ee/aoi')
    const {zip} = require('rx')
    const {map, switchMap, tap} = require('rx/operators')
    const ee = require('ee')
    const aoi = {type: 'POINT', ...latLng}
    const geometry = toGeometry(aoi)

    const segmentsForPixel$ = segments =>
        ee.getInfo$(
            segments.reduceRegion({
                reducer: ee.Reducer.first(),
                geometry,
                scale: 1
            }),
            `Get CCDC segments for pixel (${latLng})`
        )

    const timeSeriesForPixel$ = collection => {
        const band = recipe.bands[0]
        const timeSeries = collection
            .select(band)
            .map(image => {
                const value = image.reduceRegion({
                    reducer: ee.Reducer.first(),
                    geometry,
                    scale: 1
                }).getNumber(band) // Expect a single band in the recipe
                return ee.Feature(null, {date: image.date(), value})
            })
            .filter(ee.Filter.notNull(['value']))
        return ee.getInfo$(timeSeries, `Get time-serie for pixel (${latLng})`)
    }

    const collectionBands = [...new Set([...recipe.bands, ...recipe.breakpointBands])]
    return getCollection$({...recipe, bands: collectionBands, aoi}).pipe(
        switchMap(collection => {
            return getSegments$({...recipe, collection, aoi, bands: collectionBands}).pipe(
                switchMap(segments =>
                    zip(
                        segmentsForPixel$(segments),
                        timeSeriesForPixel$(collection)
                    )
                )
            )
        }),
        map(([segments, timeSeries]) => {
            return ({
                segments,
                timeSeries: timeSeries.features.map(({properties: {date, value}}) => ({date: date.value, value}))
            })
        })
    )
}

module.exports = job({
    jobName: 'LoadCCDCChart',
    jobPath: __filename,
    worker$
})
