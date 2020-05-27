const _ = require('lodash')
const {v4: uuid} = require('uuid')

class Exception extends Error {
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

class ServerException extends Exception {
    constructor(error, {userMessage, operationId} = {}) {
        super('system', error, userMessage, operationId)
        this.name = 'ServerException'
        this.statusCode = 500
        if (!userMessage) {
            this.userMessage = this.defaultUserMessage(error)
        }
    }

    defaultUserMessage(_error) {
        return {
            message: 'Internal error',
            key: 'error.internal'
        }
    }
}

class ClientException extends Exception {
    constructor(error, {userMessage, operationId} = {}) {
        super('system', error, userMessage, operationId)
        this.name = 'ClientException'
        this.statusCode = 400
    }
}

class NotFoundException extends ClientException {
    constructor(error, {userMessage, operationId} = {}) {
        super('notfound', error, userMessage, operationId)
        this.name = 'NotFoundException'
        this.statusCode = 404
    }
}

const isException = error => error instanceof Exception

module.exports = {ServerException, ClientException, NotFoundException, isException}
