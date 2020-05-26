const _ = require('lodash')
const {v4: uuid} = require('uuid')

class _Exception extends Error {
    constructor(type, error, userMessage, operationId = uuid().substr(-4)) {
        super(error)
        this.name = 'Exception'
        this.type = type
        this.cause = _.isString(error)
            ? new Error(error)
            : error
        this.userMessage = userMessage
        this.operationId = operationId
    }
}

class Exception extends _Exception {
    constructor({error, userMessage, operationId}) {
        super('default', error, userMessage, operationId)
        this.name = 'Exception'
    }
}

class SystemException extends _Exception {
    constructor({error, userMessage, operationId}) {
        super('system', error, userMessage, operationId)
        this.name = 'SystemException'
    }
}

class NotFoundException extends _Exception {
    constructor({error, userMessage, operationId}) {
        super('notfound', error, userMessage, operationId)
        this.name = 'NotFoundException'
    }
}

const isException = error => error instanceof _Exception

module.exports = {Exception, SystemException, NotFoundException, isException}
