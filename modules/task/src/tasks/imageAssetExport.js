const ImageFactory = require('sepal/ee/imageFactory')
const {switchMap} = require('rxjs')
const {exportImageToAsset$} = require('../jobs/export/toAsset')
const {toVisualizationProperties} = require('../ee/visualizations')
const {formatProperties} = require('./formatProperties')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale, pyramidingPolicy, properties, visualizations}}) => {
        const description = recipe.title || recipe.placeholder
        return export$({description, recipe, bands, scale, pyramidingPolicy, properties, visualizations})
    }
}

const export$ = ({description, recipe, bands, scale, pyramidingPolicy, properties, visualizations}) =>
    ImageFactory(recipe, bands).getImage$().pipe(
        switchMap(image => {
            const formattedProperties = formatProperties({...properties, scale})
            const visualizationProperties = toVisualizationProperties(visualizations, bands)
            const imageWithProperties = image
                .set(formattedProperties)
                .set(visualizationProperties)
            return exportImageToAsset$({
                image: imageWithProperties,
                description,
                scale,
                crs: 'EPSG:4326',
                maxPixels: 1e13,
                pyramidingPolicy
            })
        }
        )
    )
