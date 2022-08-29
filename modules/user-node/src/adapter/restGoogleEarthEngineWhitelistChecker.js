const {get$} = require('sepal/httpClient')
const Path = require('node:path')

const RestGoogleEarthEngineWhitelistChecker = googleEarthEngineUri => {
    const isWhitelisted = () => {
        get$(Path.join(googleEarthEngineUri, 'healthcheck'), {
            headers: {
                'sepal-user': new User(username, tokens).jsonString()
            }
        })
    }

    return {
        isWhitelisted
    }
}

module.exports = {RestGoogleEarthEngineWhitelistChecker}
