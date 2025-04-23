const _ = require('lodash')
const {v4: uuid} = require('uuid')

class Exception extends Error {
    constructor(message, {cause, userMessage, errorCode, statusCode, operationId = uuid()}) {
        super(message)
        this.name = 'Exception'
        this.cause = cause
        this.userMessage = userMessage
        this.errorCode = errorCode
        this.statusCode = statusCode
        this.operationId = operationId
        this.sepalException = true
    }
}

class ServerException extends Exception {
    constructor(message, {cause, userMessage, errorCode, statusCode, operationId} = {}) {
        super(message, {cause, userMessage, errorCode, operationId})
        this.name = 'ServerException'
        this.statusCode = statusCode || 500
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
    constructor(error, {cause, userMessage, errorCode, statusCode, operationId} = {}) {
        super(error, {cause, userMessage, errorCode, operationId})
        this.name = 'ClientException'
        this.statusCode = statusCode || 400
        if (!userMessage) {
            this.userMessage = this.defaultUserMessage()
        }
    }

    defaultUserMessage() {
        return {
            message: 'Bad Request',
            key: 'error.badRequest'
        }
    }
}

class NotFoundException extends ClientException {
    constructor(error, {cause, userMessage, errorCode, operationId} = {}) {
        super(error, {cause, userMessage, errorCode, operationId})
        this.name = 'NotFoundException'
        this.statusCode = 404
        if (!userMessage) {
            this.userMessage = this.defaultUserMessage()
        }
    }

    defaultUserMessage() {
        return {
            message: 'Not found',
            key: 'error.notFound'
        }
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

const ERROR_CODES = {
    EE_NOT_AVAILABLE: 'EE_NOT_AVAILABLE',
    MISSING_OAUTH_SCOPES: 'MISSING_OAUTH_SCOPES',
    MISSING_GOOGLE_TOKENS: 'MISSING_GOOGLE_TOKENS',
}

module.exports = {ServerException, ClientException, NotFoundException, toException, errorReport, ERROR_CODES}
