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
    _.assign(ee, require('./utils')(ee))
    patch(ee.Image, require('./image')(ee))
    patch(ee.ImageCollection, require('./imageCollection')(ee))
    patch(ee.Number, require('./number')(ee))
}
