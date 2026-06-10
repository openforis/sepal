import ee from '#sepal/ee/ee'
import {encodeError} from '#sepal/ee/exception'

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

export {validateEEImage, validateEEImageCollection}
