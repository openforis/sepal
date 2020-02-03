const _ = require('lodash')

class _Exception extends Error {
    constructor(type, cause, message, key, data) {
        super(message)
        this.type = type
        this.cause = _.isString(cause)
            ? new Error(cause)
            : cause
        this.key = key
        this.data = data
    }
}

class Exception extends _Exception {
    constructor(cause, message, key, data) {
        super('default', cause, message, key, data)
    }
}

class SystemException extends _Exception {
    constructor(cause, message, key, data) {
        super('system', cause, message, key, data)
    }
}

class NotFoundException extends _Exception {
    constructor(cause, message, key, data) {
        super('notfound', cause, message, key, data)
    }
}

const isException = error => error instanceof _Exception

module.exports = {Exception, SystemException, NotFoundException, isException}
