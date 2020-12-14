const {pipe} = require('rx')
const {map} = require('rx/operators')

module.exports = {
    progress: ({defaultMessage, messageKey, messageArgs}) =>
        pipe(
            map(() => ({defaultMessage, messageKey, messageArgs}))
        )

}
