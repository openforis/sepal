const ee = require('@google/earthengine')
const _ = require('lodash')

const patch = (eeClass, extensions) =>
    _.forEach(extensions, (extension, name) => {
        if (eeClass.prototype[name]) {
            throw Error(`${eeClass} already defines method ${name}`)
        } else {
            eeClass.prototype[name] = extension
        }
    })

patch(ee.Image, require('./image'))
patch(ee.Number, require('./number'))
