const _ = require('lodash')

module.exports = ee => {
    // instance methods
    return {
        isEmpty() {
            return ee.isNull(this.first())
        }
    }
}
