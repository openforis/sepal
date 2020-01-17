const {of} = require('rxjs')
const {delay, switchMap, tap} = require('rxjs/operators')
const ImageFactory = require('sepal/ee/imageFactory')
const ee = require('ee')
const log = require('sepal/log')('taskTest')
const {exportImageToAsset$} = require('root/ee/export')
const progress = require('root/progress')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale}}) => {
        // return of(progress({defaultMessage: 'Testing sepal export'}))
        const {getImage$} = ImageFactory(recipe, bands)
        const description = recipe.title
        const assetId = 'users/wiell/testExport'
        return getImage$().pipe(
            switchMap(image => exportImageToAsset$({
                image, description, assetId, scale
                // image, description, scale
            }))
        )
    }
}
