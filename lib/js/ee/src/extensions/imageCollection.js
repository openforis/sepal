const _ = require('lodash')

module.exports = _ee => {
    // instance methods
    return {
        isEmpty() {
            return this.limit(1).size().eq(0)
        }
    }
}
