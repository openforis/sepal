const ImageFactory = require('sepal/ee/imageFactory')
const {switchMap} = require('rx/operators')
const {exportImageToAsset$} = require('../jobs/export/toAsset')
const _ = require('lodash')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale, pyramidingPolicy, properties}}) => {
        const description = recipe.title || recipe.placeholder
        return export$({description, recipe, bands, scale, pyramidingPolicy, properties})
    }
}

const export$ = ({description, recipe, bands, scale, pyramidingPolicy, properties}) =>
    ImageFactory(recipe, bands).getImage$().pipe(
        switchMap(image => {
            const formattedProperties = formatProperties({...properties, scale})
            const imageWithProperties = image.set(formattedProperties)
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