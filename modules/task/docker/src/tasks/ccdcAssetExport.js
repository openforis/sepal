const {exportImageToAsset$} = require('../jobs/export/toAsset')
const {switchMap} = require('rx/operators')
const ccdc = require('sepal/ee/timeSeries/ccdc')
const {toVisualizationProperties} = require('../ee/visualizations')

module.exports = {
    submit$: (id, {recipe, bands, scale, description, visualizations}) => {
        return ccdc(recipe, {selection: bands}).getImage$().pipe(
            switchMap(segments => {
                return exportImageToAsset$({
                    image: segments
                        .set('startDate', recipe.model.dates.startDate)
                        .set('endDate', recipe.model.dates.endDate)
                        .set('dateFormat', recipe.model.ccdcOptions.dateFormat)
                        .set('surfaceReflectance', recipe.model.options.corrections.includes('SR') && 1)
                        .set(toVisualizationProperties(visualizations, {selection: bands})),
                    description,
                    pyramidingPolicy: {'.default': 'sample'},
                    scale,
                    crs: 'EPSG:4326',
                    maxPixels: 1e13
                })
            })
        )
    }
}
