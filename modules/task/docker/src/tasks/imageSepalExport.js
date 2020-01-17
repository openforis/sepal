const {of} = require('rxjs')
const {delay, switchMap, tap} = require('rxjs/operators')
const ImageFactory = require('sepal/ee/imageFactory')
const ee = require('ee')
const log = require('sepal/log')('taskTest')
const {exportImageToAsset$} = require('root/ee/export')
const progress = require('root/progress')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale}}) => {
        const {getImage$} = ImageFactory(recipe, bands)
        const description = recipe.title
        return getImage$().pipe(
            switchMap(image => exportImageToAsset$({
                image, description, scale
            }))
        )
    }
}
