const {pipe, map} = require('rxjs')

module.exports = {
    progress: ({defaultMessage, messageKey, messageArgs}) =>
        pipe(
            map(() => ({defaultMessage, messageKey, messageArgs}))
        )

}
