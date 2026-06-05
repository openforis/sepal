import _ from 'lodash'

export default (arg, validator, msg, required = false) => {
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
