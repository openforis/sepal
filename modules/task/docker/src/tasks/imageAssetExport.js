const {switchMap} = require('rxjs/operators')
const ImageFactory = require('sepal/ee/imageFactory')
const {exportImageToAsset$} = require('root/ee/export')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale}}) => {
        const {getImage$} = ImageFactory(recipe, bands)
        return getImage$().pipe(
            switchMap(image => exportImageToAsset$({
                image, description: recipe.title, scale
            }))
        )
    }
}
