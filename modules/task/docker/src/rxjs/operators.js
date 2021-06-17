const {pipe} = require('rxjs')
const {map} = require('rxjs/operators')

module.exports = {
    progress: ({defaultMessage, messageKey, messageArgs}) =>
        pipe(
            map(() => ({defaultMessage, messageKey, messageArgs}))
        )

}
