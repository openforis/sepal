const {SystemException} = require('sepal/exception')

class EEException extends SystemException {
    constructor({error, userMessage, operationId}) {
        super({error, userMessage, operationId})
        this.name = `EarthEngineException${operationId ? ` [${operationId}]` : ''}`
    }
}

module.exports = {EEException}
