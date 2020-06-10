const ImageFactory = require('sepal/ee/imageFactory')
const {switchMap} = require('rx/operators')
const {exportImageToAsset$} = require('root/ee/export/toAsset')
// const log = require('sepal/log').getLogger('task')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale}}) => {
        const description = recipe.title || recipe.placeholder
        return export$({description, recipe, bands, scale})
    }
}

const export$ = ({description, recipe, bands, scale}) =>
    ImageFactory(recipe, bands).getImage$().pipe(
        switchMap(image =>
            exportImageToAsset$({
                image, description, scale, crs: 'EPSG:4326', maxPixels: 1e13
            })
        )
    )
