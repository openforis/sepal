const ImageFactory = require('sepal/ee/imageFactory')
const {switchMap} = require('rx/operators')
const {exportImageToAsset$} = require('../jobs/export/toAsset')
const _ = require('lodash')

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

const formatProperties = properties => {
    const formatted = {}
    Object.keys(properties).forEach(key => {
        const value = properties[key]
        formatted[key] = _.isString(value) || _.isNumber(value) ? value : JSON.stringify(value)
    })
    return formatted
}

const toVisualizationProperties = (visualizations = [], bands) => {
    const filteredVisualizations = visualizations
        .filter(visParams => visParams.bands.every(band => bands.selection.includes(band)))
    const result = {}
    filteredVisualizations.forEach((visParams, i) => {
        Object.keys(visParams).forEach(key => {
            const value = visParams[key]
            result[`visualization_${i}_${key}`] = _.isArray(value) ? value.join(',') : value
        })
    })
    return result
}
