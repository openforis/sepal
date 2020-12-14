const {exportImageToAsset$} = require('../jobs/export/toAsset')
const {switchMap} = require('rx/operators')
const {getCollection$} = require('sepal/ee/timeSeries/collection')
const {getSegments$} = require('sepal/ee/timeSeries/ccdc')

module.exports = {
    submit$: (id, recipe) => {
        const description = recipe.description
        const scale = recipe.scale
        const collectionBands = [...new Set([...recipe.bands, ...recipe.breakpointBands])]
        return getCollection$({...recipe, bands: collectionBands}).pipe(
            switchMap(collection => getSegments$({...recipe, collection})),
            switchMap(segments =>
                exportImageToAsset$({
                    image: segments
                        .set('startDate', recipe.fromDate)
                        .set('endDate', recipe.toDate)
                        .set('dateFormat', recipe.dateFormat)
                        .set('surfaceReflectance', recipe.surfaceReflectance && 1),
                    description,
                    pyramidingPolicy: {'.default': 'sample'},
                    scale,
                    crs: 'EPSG:4326',
                    maxPixels: 1e13
                })
            )
        )
    }
}
