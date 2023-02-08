const {map, zip} = require('rxjs')
const imageFactory = require('#sepal/ee/imageFactory')
const _ = require('lodash')

const masking = (recipe, ...args) => {
    const model = recipe.model
    const imageToMask = imageFactory(model.imageToMask, ...args)
    const imageMask = model.imageMask && imageFactory(model.imageMask)
    return {
        getImage$() {
            return zip(
                imageToMask.getImage$(),
                imageMask?.getImage$()
            ).pipe(
                map(([eeImageToMask, eeImageMask]) =>
                    eeImageToMask.updateMask(eeImageMask.select(0)))
            )
        },
        getBands$() {
            return imageToMask.getBands$()
        },
        getGeometry$() {
            return imageToMask.getGeometry$()
        }
    }
}

module.exports = masking
