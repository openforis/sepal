const _ = require('lodash')

module.exports = (arg, validator, msg, required = false) => {
    const valid = required
        ? !_.isNil(arg) && validator(arg)
        : _.isNil(arg) || validator(arg)
    if (!valid) {
        throw new Error([
            msg,
            required ? '(required)' : ''
        ].join(' '))
    }
}
