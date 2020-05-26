const {SystemException} = require('sepal/exception')

class EEException extends SystemException {
    constructor(cause, defaultMessage, messageKey, messageArgs, transactionId) {
        super(cause, defaultMessage, messageKey, messageArgs, transactionId)
        this.name = 'EEException'
    }
}

module.exports = {EEException}