const {exportImageToAsset$} = require('../jobs/export/toAsset')
const {switchMap} = require('rx/operators')
const {getTimeSeries$} = require('sepal/ee/ccdc/ccdc')

module.exports = {
    submit$: (id, recipe) => {
        const description = recipe.description
        const scale = recipe.scale

        return getTimeSeries$(recipe).pipe(
            switchMap(image =>
                exportImageToAsset$({
                    image,
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
