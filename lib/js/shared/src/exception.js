const {v4: uuid} = require('uuid')
const _ = require('lodash')

const createId = () => uuid().substr(-4)

class _Exception extends Error {
    constructor(type, cause, defaultMessage, messageKey, messageArgs, transactionId = createId()) {
        super(defaultMessage)
        this.name = 'Exception'
        this.type = type
        this.cause = _.isString(cause)
            ? new Error(cause)
            : cause
        this.defaultMessage = defaultMessage
        this.messageKey = messageKey
        this.messageArgs = messageArgs
        this.transactionId = transactionId
    }
}

class Exception extends _Exception {
    constructor(cause, defaultMessage, messageKey, messageArgs, transactionId = createId()) {
        super('default', cause, defaultMessage, messageKey, messageArgs, transactionId)
        this.name = 'Exception'
    }
}

class SystemException extends _Exception {
    constructor(cause, defaultMessage, messageKey, messageArgs, transactionId = createId()) {
        super('system', cause, defaultMessage, messageKey, messageArgs, transactionId)
        this.name = 'SystemException'
    }
}

class NotFoundException extends _Exception {
    constructor(cause, defaultMessage, messageKey, messageArgs, transactionId = createId()) {
        super('notfound', cause, defaultMessage, messageKey, messageArgs, transactionId)
        this.name = 'NotFoundException'
    }
}

const isException = error => error instanceof _Exception

module.exports = {Exception, SystemException, NotFoundException, isException}
