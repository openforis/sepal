const _ = require('lodash')

const patch = (eeClass, extensions) =>
    _.forEach(extensions, (extension, name) => {
        if (eeClass.prototype[name]) {
            throw Error(`${eeClass} already defines method ${name}`)
        } else {
            eeClass.prototype[name] = extension
        }
    })

module.exports = ee => {
    _.assign(ee, require('./extensions/utils')(ee))
    patch(ee.Image, require('./extensions/image')(ee))
    patch(ee.ImageCollection, require('./extensions/imageCollection')(ee))
    patch(ee.Number, require('./extensions/number')(ee))
}
