const {SystemException} = require('sepal/exception')

class EEException extends SystemException {
    constructor(cause, defaultMessage, messageKey, messageArgs) {
        super(null, defaultMessage, messageKey, messageArgs)
    }
}

module.exports = {EEException}