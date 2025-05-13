const {ServerException} = require('#sepal/exception')

class EEException extends ServerException {
    constructor(message, {cause, userMessage, errorCode, statusCode, operationId} = {}) {
        super(message, {cause, userMessage, errorCode, operationId})
        if (statusCode) {
            this.statusCode = statusCode
        }
        this.name = `EarthEngineException${operationId ? ` [${operationId}]` : ''}`
        if (!userMessage) {
            this.userMessage = this.defaultUserMessage(cause)
        }
        this.userMessage.operationId = operationId
    }

    defaultUserMessage(error) {
        return {
            message: `Earth Engine: ${error}`,
            key: 'gee.error.earthEngineException',
            args: {earthEngineMessage: error}
        }
    }
}

const createEEException = (error, operation, operationId) => {
    if (error.sepalException) {
        return error
    }
    const decoded = decodeError(error)
    if (decoded) {
        return new EEException(decoded.userMessage.message, {
            cause: error,
            operationId,
            ...decoded,
        })
    } else {
        return new EEException(`Failed to ${operation}: ${error}`, {
            cause: error,
            userMessage: {
                message: `Earth Engine: ${error}`,
                key: 'gee.error.earthEngineException',
                args: {earthEngineMessage: error}
            },
            operationId
        })
    }
}

const encodeError = error =>
    `[error: ${JSON.stringify(error)}]`

const decodeError = error => {
    if (typeof error == 'string') {
        const match = new RegExp(/.*\[error: (.*)].*/, 'm').exec(error)
        return match ? JSON.parse(match[1]) : null
    } else {
        return null
    }
}

module.exports = {EEException, createEEException, encodeError}
