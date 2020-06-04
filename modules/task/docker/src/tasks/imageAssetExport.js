const {switchMap} = require('rx/operators')
const ImageFactory = require('sepal/ee/imageFactory')
const {exportImageToAsset$} = require('root/ee/export')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale}}) => {
        const description = recipe.title || recipe.placeholder
        const {getImage$} = ImageFactory(recipe, bands)
        return getImage$().pipe(
            switchMap(image => exportImageToAsset$({
                image, description, scale, crs: 'EPSG:4326', maxPixels: 1e13
            }))
        )
    }
}
