const {pipe} = require('rxjs')
const {map} = require('rxjs/operators')
const progress = require('root/progress')

module.exports = {
    progress: ({defaultMessage, messageKey, messageArgs}) =>
        pipe(
            map(() => progress({defaultMessage, messageKey, messageArgs}))
        )

}
