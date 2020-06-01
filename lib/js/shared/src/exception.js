const _ = require('lodash')
const {v4: uuid} = require('uuid')

class Exception extends Error {
    constructor(message, {cause, userMessage, operationId = uuid().substr(-4)}) {
        super(message)
        this.name = 'Exception'
        this.cause = cause
        this.userMessage = userMessage
        this.operationId = operationId
        this.sepalException = true
    }
}

class ServerException extends Exception {
    constructor(message, {cause, userMessage, operationId} = {}) {
        super(message, {cause, userMessage, operationId})
        this.name = 'ServerException'
        this.statusCode = 500
        if (!userMessage) {
            this.userMessage = this.defaultUserMessage()
        }
    }

    defaultUserMessage() {
        return {
            message: 'Internal error',
            key: 'error.internal'
        }
    }
}

class ClientException extends Exception {
    constructor(error, {cause, userMessage, operationId} = {}) { // TODO: What if we don't specify a userMessage?
        super(error, {cause, userMessage, operationId})
        this.name = 'ClientException'
        this.statusCode = 400
    }
}

class NotFoundException extends ClientException {
    constructor(error, {cause, userMessage, operationId} = {}) {
        super(error, {cause, userMessage, operationId})
        this.name = 'NotFoundException'
        this.statusCode = 404
    }
}

const toException = error =>
    error.sepalException
        ? error
        : _.isString(error)
            ? new ServerException(error)
            : new ServerException(error.message, {cause: error})

const errorReport = error =>
    [
        error.stack || error.message || error,
        error.cause && (`Caused by: ${errorReport(error.cause)}`)
    ].join('\n').trimEnd()

module.exports = {ServerException, ClientException, NotFoundException, toException, errorReport}
