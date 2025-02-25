const ee = require('#sepal/ee')
const {encodeError} = require('#sepal/ee/exception')

const validateEEImage = ({valid, image, error}) => {
    return ee.Image(
        ee.Algorithms.If(
            valid,
            image,
            encodeError(error)
        )
    )
}

const validateEEImageCollection = ({valid, imageCollection, error}) => {
    return ee.ImageCollection(
        ee.Algorithms.If(
            valid,
            imageCollection,
            encodeError(error)
        )
    )
}

module.exports = {validateEEImage, validateEEImageCollection}
