const _ = require('lodash')

module.exports = ee => {
    const patch = (eeClass, extensions) =>
        _.forEach(extensions, (extension, name) => {
            if (eeClass.prototype[name]) {
                throw Error(`${eeClass} already defines method ${name}`)
            } else {
                eeClass.prototype[name] = extension
            }
        })

    _.assign(ee, require('./utils')(ee))
    patch(ee.Image, require('./image')(ee))
    patch(ee.Number, require('./number')(ee))
}
