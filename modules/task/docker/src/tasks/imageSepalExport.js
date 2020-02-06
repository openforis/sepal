const {switchMap} = require('rxjs/operators')
const ImageFactory = require('sepal/ee/imageFactory')
const {exportImageToSepal$} = require('root/ee/export')
const config = require('root/config')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale}}) => {
        const description = recipe.title || recipe.placeholder
        const downloadDir = `${config.homeDir}/downloads/${description}/`
        const {getImage$} = ImageFactory(recipe, bands)
        return getImage$().pipe(
            switchMap(image => exportImageToSepal$({
                image, description, downloadDir, scale, crs: 'EPSG:4326', maxPixels: 1e13
            }))
        )
    }
}
