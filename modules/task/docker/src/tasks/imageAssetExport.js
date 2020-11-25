const ImageFactory = require('sepal/ee/imageFactory')
const {switchMap} = require('rx/operators')
const {exportImageToAsset$} = require('../jobs/export/toAsset')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale, pyramidingPolicy}}) => {
        const description = recipe.title || recipe.placeholder
        return export$({description, recipe, bands, scale, pyramidingPolicy})
    }
}

const export$ = ({description, recipe, bands, scale, pyramidingPolicy}) =>
    ImageFactory(recipe, bands).getImage$().pipe(
        switchMap(image =>
            exportImageToAsset$({
                image, description, scale, crs: 'EPSG:4326', maxPixels: 1e13, pyramidingPolicy
            })
        )
    )
