import _ from 'lodash'
import utils from './extensions/utils.js'
import image from './extensions/image.js'
import imageCollection from './extensions/imageCollection.js'
import number from './extensions/number.js'

const patch = (eeClass, extensions) =>
    _.forEach(extensions, (extension, name) => {
        if (eeClass.prototype[name]) {
            throw Error(`${eeClass} already defines method ${name}`)
        } else {
            eeClass.prototype[name] = extension
        }
    })

export default ee => {
    _.assign(ee, utils(ee))
    patch(ee.Image, image(ee))
    patch(ee.ImageCollection, imageCollection(ee))
    patch(ee.Number, number(ee))
}
