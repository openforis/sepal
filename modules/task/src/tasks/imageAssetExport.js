const ImageFactory = require('sepal/ee/imageFactory')
const {switchMap} = require('rxjs')
const {exportImageToAsset$} = require('../jobs/export/toAsset')
const {toVisualizationProperties} = require('../ee/visualizations')
const {formatProperties} = require('./formatProperties')

module.exports = {
    submit$: (_id, {
        image: {recipe, ...retrieveOptions}
    }) => {
        const description = recipe.title || recipe.placeholder
        return export$({description, recipe, ...retrieveOptions})
    }
}

const export$ = ({recipe, bands, visualizations, scale, properties, ...retrieveOptions}) =>
    ImageFactory(recipe, bands).getImage$().pipe(
        switchMap(image => {
            const formattedProperties = formatProperties({...properties, scale})
            const visualizationProperties = toVisualizationProperties(visualizations, bands)
            const imageWithProperties = image
                .set(formattedProperties)
                .set(visualizationProperties)
            return exportImageToAsset$({
                image: imageWithProperties,
                scale,
                ...retrieveOptions
            })
        }
        )
    )
