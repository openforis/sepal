const {ServerException} = require('#sepal/exception')

class EEException extends ServerException {
    constructor(message, {cause, userMessage, errorCode, operationId} = {}) {
        super(message, {cause, userMessage, errorCode, operationId})
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

module.exports = {EEException}
