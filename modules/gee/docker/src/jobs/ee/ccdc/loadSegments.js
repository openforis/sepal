const {job} = require('root/jobs/job')

const worker$ = ({asset, recipe, latLng, bands}) => {
    const {toGeometry} = require('sepal/ee/aoi')
    const {getCollection$} = require('sepal/ee/timeSeries/collection')
    const {getSegments$} = require('sepal/ee/timeSeries/ccdc')
    const {of} = require('rx')
    const {switchMap} = require('rx/operators')
    const ee = require('ee')

    const aoi = {type: 'POINT', ...latLng}
    const geometry = toGeometry(aoi)

    const segmentsForPixel$ = segments$ =>
        segments$.pipe(
            switchMap(segments =>
                ee.getInfo$(
                    segments.reduceRegion({
                        reducer: ee.Reducer.first(),
                        geometry,
                        scale: 10
                    }),
                    `Get CCDC segments for pixel (${latLng})`
                )
            )
        )

    const assetSegments$ = () =>
        of(new ee.Image(asset))

    const recipeSegments$ = () => {
        const aoi = {type: 'POINT', ...latLng}
        const collectionBands = [...new Set([...bands, ...recipe.breakpointBands])]
        return getCollection$({...recipe, bands: collectionBands, aoi}).pipe(
            switchMap(collection => {
                return getSegments$({...recipe, collection, aoi, bands: collectionBands})
            })
        )
    }

    const segments$ = asset
        ? assetSegments$()
        : recipeSegments$()
    return segmentsForPixel$(segments$)
}

module.exports = job({
    jobName: 'LoadCCDCSegments',
    jobPath: __filename,
    worker$
})
